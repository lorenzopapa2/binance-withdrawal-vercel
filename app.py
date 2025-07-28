import os
import logging
import socket
import requests
import random
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import json
from datetime import datetime
import threading
import time
import uuid

from config import config
from database import DatabaseManager
from binance_client import BinanceWithdrawalClient

# 创建Flask应用
app = Flask(__name__)
app.config.from_object(config['development'])

# 初始化SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# 初始化数据库
db = DatabaseManager(app.config['DATABASE_PATH'])

# 全局变量
binance_client = None
withdrawal_tasks = {}
batch_tasks = {}

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 确保日志目录存在
os.makedirs('logs', exist_ok=True)

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    """API配置管理"""
    if request.method == 'POST':
        data = request.get_json()
        api_key = data.get('api_key', '').strip()
        api_secret = data.get('api_secret', '').strip()
        testnet = data.get('testnet', True)
        
        if not api_key or not api_secret:
            return jsonify({'success': False, 'message': 'API Key和Secret不能为空'})
        
        # 保存配置到数据库
        db.save_config('api_key', api_key)
        db.save_config('api_secret', api_secret)
        db.save_config('testnet', str(testnet))
        
        # 初始化Binance客户端
        global binance_client
        binance_client = BinanceWithdrawalClient(api_key, api_secret, testnet)
        
        if binance_client.connect():
            db.add_operation_log('API配置', f'成功连接到Binance API (测试网: {testnet})')
            socketio.emit('log_update', {
                'type': 'success',
                'message': f'API配置成功 (测试网: {testnet})',
                'timestamp': datetime.now().isoformat()
            })
            return jsonify({'success': True, 'message': 'API配置成功'})
        else:
            db.add_operation_log('API配置', 'API连接失败', 'ERROR')
            return jsonify({'success': False, 'message': 'API连接失败，请检查Key和Secret'})
    
    else:
        # 获取当前配置
        api_key = db.get_config('api_key') or ''
        testnet = db.get_config('testnet') == 'True'
        
        # 隐藏API Key的部分字符
        masked_key = api_key[:8] + '*' * (len(api_key) - 16) + api_key[-8:] if len(api_key) > 16 else api_key
        
        return jsonify({
            'api_key': masked_key,
            'testnet': testnet,
            'connected': binance_client is not None and binance_client.client is not None
        })

@app.route('/api/account')
def api_account():
    """获取账户信息"""
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})
    
    account_info = binance_client.get_account_info()
    if account_info:
        return jsonify({'success': True, 'data': account_info})
    else:
        return jsonify({'success': False, 'message': '获取账户信息失败'})

@app.route('/api/balance/<asset>')
def api_balance(asset):
    """获取指定资产余额"""
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})
    
    balance = binance_client.get_balance(asset.upper())
    if balance:
        return jsonify({'success': True, 'data': balance})
    else:
        return jsonify({'success': False, 'message': f'获取{asset}余额失败'})

@app.route('/api/withdraw', methods=['POST'])
def api_withdraw():
    """执行提币"""
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})
    
    data = request.get_json()
    coin = data.get('coin', '').upper()
    address = data.get('address', '').strip()
    amount = float(data.get('amount', 0))
    network = data.get('network', '').upper()
    address_tag = data.get('address_tag', '').strip() or None
    
    # 验证参数
    if not all([coin, address, amount > 0]):
        return jsonify({'success': False, 'message': '请填写完整的提币信息'})
    
    # 检查提币限额
    if amount > app.config['MAX_WITHDRAWAL_AMOUNT']:
        return jsonify({
            'success': False, 
            'message': f'提币金额超过限额 {app.config["MAX_WITHDRAWAL_AMOUNT"]}'
        })
    
    # 记录提币请求
    log_id = db.add_withdrawal_log(
        coin=coin,
        network=network,
        address=address,
        amount=amount,
        fee=0,  # 手续费稍后更新
        status='PENDING'
    )
    
    # 异步执行提币
    def execute_withdrawal():
        try:
            success, message, tx_id = binance_client.withdraw(
                coin=coin,
                address=address,
                amount=amount,
                network=network,
                address_tag=address_tag
            )
            
            if success:
                db.update_withdrawal_status(log_id, 'SUBMITTED', tx_id)
                db.add_operation_log('提币', f'{coin} {amount} -> {address}', 'SUCCESS')
                socketio.emit('withdrawal_update', {
                    'log_id': log_id,
                    'status': 'SUBMITTED',
                    'tx_id': tx_id,
                    'message': message
                })
            else:
                db.update_withdrawal_status(log_id, 'FAILED', error_message=message)
                db.add_operation_log('提币', f'{coin} {amount} -> {address}', 'ERROR', message)
                socketio.emit('withdrawal_update', {
                    'log_id': log_id,
                    'status': 'FAILED',
                    'message': message
                })
                
        except Exception as e:
            error_msg = f'提币执行异常: {str(e)}'
            db.update_withdrawal_status(log_id, 'FAILED', error_message=error_msg)
            db.add_operation_log('提币', f'{coin} {amount} -> {address}', 'ERROR', error_msg)
            socketio.emit('withdrawal_update', {
                'log_id': log_id,
                'status': 'FAILED',
                'message': error_msg
            })
    
    # 启动后台任务
    thread = threading.Thread(target=execute_withdrawal)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': '提币请求已提交，正在处理...',
        'log_id': log_id
    })

@app.route('/api/batch-withdraw', methods=['POST'])
def api_batch_withdraw():
    """批量提币"""
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})

    data = request.get_json()
    coin = data.get('coin', '').upper()
    network = data.get('network', '').upper()
    addresses = data.get('addresses', [])

    # 验证参数
    if not all([coin, network, addresses]):
        return jsonify({'success': False, 'message': '请填写完整的批量提币信息'})

    if len(addresses) > 100:  # 限制批量数量
        return jsonify({'success': False, 'message': '批量提币地址数量不能超过100个'})

    # 验证每个地址的数据
    total_amount = 0
    for addr in addresses:
        if not addr.get('address') or not addr.get('amount'):
            return jsonify({'success': False, 'message': '地址或数量不能为空'})

        amount = float(addr.get('amount', 0))
        if amount <= 0:
            return jsonify({'success': False, 'message': f'地址 {addr["address"]} 的数量必须大于0'})

        total_amount += amount

    # 检查总提币限额
    if total_amount > app.config['MAX_WITHDRAWAL_AMOUNT'] * 10:  # 批量提币限额放宽
        return jsonify({
            'success': False,
            'message': f'批量提币总金额超过限额 {app.config["MAX_WITHDRAWAL_AMOUNT"] * 10}'
        })

    # 生成批量任务ID
    task_id = str(uuid.uuid4())[:8]

    # 记录批量任务
    batch_tasks[task_id] = {
        'total': len(addresses),
        'completed': 0,
        'failed': 0,
        'status': 'PROCESSING'
    }

    # 异步执行批量提币
    def execute_batch_withdrawal():
        try:
            db.add_operation_log('批量提币开始', f'任务ID: {task_id}, 总数: {len(addresses)}')
            socketio.emit('batch_update', {
                'task_id': task_id,
                'status': 'PROCESSING',
                'message': f'开始批量提币，共{len(addresses)}个地址'
            })

            for i, addr_info in enumerate(addresses):
                try:
                    address = addr_info['address']
                    amount = float(addr_info['amount'])
                    address_tag = addr_info.get('addressTag', '') or None

                    # 记录单个提币
                    log_id = db.add_withdrawal_log(
                        coin=coin,
                        network=network,
                        address=address,
                        amount=amount,
                        fee=0,
                        status='PENDING'
                    )

                    # 执行提币
                    success, message, tx_id = binance_client.withdraw(
                        coin=coin,
                        address=address,
                        amount=amount,
                        network=network,
                        address_tag=address_tag
                    )

                    if success:
                        db.update_withdrawal_status(log_id, 'SUBMITTED', tx_id)
                        batch_tasks[task_id]['completed'] += 1
                        socketio.emit('batch_progress', {
                            'task_id': task_id,
                            'current': i + 1,
                            'total': len(addresses),
                            'address': address,
                            'status': 'SUCCESS',
                            'message': message
                        })
                    else:
                        db.update_withdrawal_status(log_id, 'FAILED', error_message=message)
                        batch_tasks[task_id]['failed'] += 1
                        socketio.emit('batch_progress', {
                            'task_id': task_id,
                            'current': i + 1,
                            'total': len(addresses),
                            'address': address,
                            'status': 'FAILED',
                            'message': message
                        })

                    # 添加延迟避免API限制
                    time.sleep(1)

                except Exception as e:
                    error_msg = f'地址 {address} 提币失败: {str(e)}'
                    db.update_withdrawal_status(log_id, 'FAILED', error_message=error_msg)
                    batch_tasks[task_id]['failed'] += 1
                    socketio.emit('batch_progress', {
                        'task_id': task_id,
                        'current': i + 1,
                        'total': len(addresses),
                        'address': address,
                        'status': 'FAILED',
                        'message': error_msg
                    })

            # 批量任务完成
            batch_tasks[task_id]['status'] = 'COMPLETED'
            completed = batch_tasks[task_id]['completed']
            failed = batch_tasks[task_id]['failed']

            db.add_operation_log(
                '批量提币完成',
                f'任务ID: {task_id}, 成功: {completed}, 失败: {failed}'
            )

            socketio.emit('batch_complete', {
                'task_id': task_id,
                'completed': completed,
                'failed': failed,
                'message': f'批量提币完成: 成功{completed}个，失败{failed}个'
            })

        except Exception as e:
            error_msg = f'批量提币执行异常: {str(e)}'
            batch_tasks[task_id]['status'] = 'FAILED'
            db.add_operation_log('批量提币错误', f'任务ID: {task_id}, 错误: {error_msg}', 'ERROR')
            socketio.emit('batch_error', {
                'task_id': task_id,
                'message': error_msg
            })

    # 启动后台任务
    thread = threading.Thread(target=execute_batch_withdrawal)
    thread.daemon = True
    thread.start()

    return jsonify({
        'success': True,
        'message': f'批量提币任务已启动，共{len(addresses)}个地址',
        'task_id': task_id
    })

@app.route('/api/smart-withdraw', methods=['POST'])
def api_smart_withdraw():
    """智能批量提币"""
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})

    data = request.get_json()
    coin = data.get('coin', '').upper()
    network = data.get('network', '').upper()
    addresses = data.get('addresses', [])
    amount_config = data.get('amount_config', {})
    interval_config = data.get('interval_config', {})

    # 验证参数
    if not all([coin, network, addresses, amount_config, interval_config]):
        return jsonify({'success': False, 'message': '请填写完整的智能提币信息'})

    if len(addresses) > 200:  # 智能提币限制更高
        return jsonify({'success': False, 'message': '智能提币地址数量不能超过200个'})

    # 验证数量配置
    if amount_config.get('mode') == 'random':
        min_amount = amount_config.get('min', 0)
        max_amount = amount_config.get('max', 0)
        if min_amount <= 0 or max_amount <= 0 or min_amount >= max_amount:
            return jsonify({'success': False, 'message': '随机数量区间设置错误'})
    elif amount_config.get('mode') == 'fixed':
        fixed_amount = amount_config.get('amount', 0)
        if fixed_amount <= 0:
            return jsonify({'success': False, 'message': '固定数量必须大于0'})
    else:
        return jsonify({'success': False, 'message': '数量配置模式错误'})

    # 验证时间间隔配置
    min_interval = interval_config.get('min', 1)
    max_interval = interval_config.get('max', 5)
    if min_interval < 1 or max_interval < 1 or min_interval >= max_interval:
        return jsonify({'success': False, 'message': '时间间隔设置错误'})

    # 生成任务ID
    task_id = str(uuid.uuid4())[:8]

    # 记录任务
    batch_tasks[task_id] = {
        'total': len(addresses),
        'completed': 0,
        'failed': 0,
        'status': 'PROCESSING',
        'type': 'SMART'
    }

    # 异步执行智能提币
    def execute_smart_withdrawal():
        try:
            db.add_operation_log('智能提币开始', f'任务ID: {task_id}, 总数: {len(addresses)}')
            socketio.emit('smart_withdrawal_start', {
                'task_id': task_id,
                'total': len(addresses),
                'message': f'开始智能提币，共{len(addresses)}个地址'
            })

            for i, addr_info in enumerate(addresses):
                try:
                    address = addr_info['address']
                    address_tag = addr_info.get('tag', '') or None

                    # 生成提币数量
                    if amount_config['mode'] == 'random':
                        amount = round(
                            random.uniform(amount_config['min'], amount_config['max']),
                            8
                        )
                    else:
                        amount = amount_config['amount']

                    # 记录单个提币
                    log_id = db.add_withdrawal_log(
                        coin=coin,
                        network=network,
                        address=address,
                        amount=amount,
                        fee=0,
                        status='PENDING'
                    )

                    # 执行提币
                    success, message, tx_id = binance_client.withdraw(
                        coin=coin,
                        address=address,
                        amount=amount,
                        network=network,
                        address_tag=address_tag
                    )

                    if success:
                        db.update_withdrawal_status(log_id, 'SUBMITTED', tx_id)
                        batch_tasks[task_id]['completed'] += 1
                        socketio.emit('smart_withdrawal_progress', {
                            'task_id': task_id,
                            'current': i + 1,
                            'total': len(addresses),
                            'address': address,
                            'amount': amount,
                            'status': 'SUCCESS',
                            'message': message,
                            'tx_id': tx_id
                        })
                    else:
                        db.update_withdrawal_status(log_id, 'FAILED', error_message=message)
                        batch_tasks[task_id]['failed'] += 1
                        socketio.emit('smart_withdrawal_progress', {
                            'task_id': task_id,
                            'current': i + 1,
                            'total': len(addresses),
                            'address': address,
                            'amount': amount,
                            'status': 'FAILED',
                            'message': message
                        })

                    # 如果不是最后一个地址，添加随机间隔
                    if i < len(addresses) - 1:
                        interval = random.randint(min_interval, max_interval)
                        socketio.emit('smart_withdrawal_waiting', {
                            'task_id': task_id,
                            'next_in': interval,
                            'message': f'等待 {interval} 秒后处理下一个地址...'
                        })
                        time.sleep(interval)

                except Exception as e:
                    error_msg = f'地址 {address} 提币失败: {str(e)}'
                    if 'log_id' in locals():
                        db.update_withdrawal_status(log_id, 'FAILED', error_message=error_msg)
                    batch_tasks[task_id]['failed'] += 1
                    socketio.emit('smart_withdrawal_progress', {
                        'task_id': task_id,
                        'current': i + 1,
                        'total': len(addresses),
                        'address': address,
                        'amount': amount if 'amount' in locals() else 0,
                        'status': 'FAILED',
                        'message': error_msg
                    })

            # 任务完成
            batch_tasks[task_id]['status'] = 'COMPLETED'
            completed = batch_tasks[task_id]['completed']
            failed = batch_tasks[task_id]['failed']

            db.add_operation_log(
                '智能提币完成',
                f'任务ID: {task_id}, 成功: {completed}, 失败: {failed}'
            )

            socketio.emit('smart_withdrawal_complete', {
                'task_id': task_id,
                'completed': completed,
                'failed': failed,
                'message': f'智能提币完成: 成功{completed}个，失败{failed}个'
            })

        except Exception as e:
            error_msg = f'智能提币执行异常: {str(e)}'
            batch_tasks[task_id]['status'] = 'FAILED'
            db.add_operation_log('智能提币错误', f'任务ID: {task_id}, 错误: {error_msg}', 'ERROR')
            socketio.emit('smart_withdrawal_error', {
                'task_id': task_id,
                'message': error_msg
            })

    # 启动后台任务
    thread = threading.Thread(target=execute_smart_withdrawal)
    thread.daemon = True
    thread.start()

    return jsonify({
        'success': True,
        'message': f'智能提币任务已启动，共{len(addresses)}个地址',
        'task_id': task_id
    })

@app.route('/api/withdrawal-history')
def api_withdrawal_history():
    """获取提币历史"""
    limit = request.args.get('limit', 50, type=int)
    logs = db.get_withdrawal_logs(limit)
    return jsonify({'success': True, 'data': logs})

@app.route('/api/operation-logs')
def api_operation_logs():
    """获取操作日志"""
    limit = request.args.get('limit', 100, type=int)
    logs = db.get_operation_logs(limit)
    return jsonify({'success': True, 'data': logs})

@app.route('/api/ip-info')
def api_ip_info():
    """获取本机IP信息"""
    try:
        # 获取本机内网IP
        local_ip = None
        try:
            # 连接到外部地址来获取本机IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except:
            local_ip = socket.gethostbyname(socket.gethostname())

        # 获取外网IP
        public_ip = None
        try:
            response = requests.get('https://api.ipify.org?format=json', timeout=5)
            if response.status_code == 200:
                public_ip = response.json().get('ip')
        except:
            try:
                response = requests.get('https://httpbin.org/ip', timeout=5)
                if response.status_code == 200:
                    public_ip = response.json().get('origin')
            except:
                pass

        return jsonify({
            'success': True,
            'data': {
                'local_ip': local_ip,
                'public_ip': public_ip
            }
        })
    except Exception as e:
        logger.error(f'获取IP信息失败: {str(e)}')
        return jsonify({'success': False, 'message': '获取IP信息失败'})

@socketio.on('connect')
def handle_connect():
    """WebSocket连接"""
    logger.info('客户端已连接')
    emit('connected', {'message': '已连接到服务器'})

@socketio.on('disconnect')
def handle_disconnect():
    """WebSocket断开连接"""
    logger.info('客户端已断开连接')

if __name__ == '__main__':
    # 初始化已保存的API配置
    api_key = db.get_config('api_key')
    api_secret = db.get_config('api_secret')
    testnet = db.get_config('testnet') == 'True'
    
    if api_key and api_secret:
        binance_client = BinanceWithdrawalClient(api_key, api_secret, testnet)
        if binance_client.connect():
            logger.info('使用已保存的API配置成功连接到Binance')
    
    # 启动应用
    socketio.run(app, debug=True, host='0.0.0.0', port=8888, allow_unsafe_werkzeug=True)
