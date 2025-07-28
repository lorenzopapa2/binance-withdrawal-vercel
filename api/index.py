import os
import logging
import requests
import random
from flask import Flask, render_template, request, jsonify
import json
from datetime import datetime
import uuid
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import config
from binance_client import BinanceWithdrawalClient

# 创建Flask应用
app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config.from_object(config['production'])
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-here')

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全局变量
binance_clients = {}

@app.route('/')
def index():
    """主页"""
    return render_template('index-vercel.html')

@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    """API配置管理"""
    session_id = request.headers.get('X-Session-ID', 'default')
    
    if request.method == 'POST':
        data = request.get_json()
        api_key = data.get('api_key', '').strip()
        api_secret = data.get('api_secret', '').strip()
        testnet = data.get('testnet', True)
        
        if not api_key or not api_secret:
            return jsonify({'success': False, 'message': 'API Key和Secret不能为空'})
        
        # 初始化Binance客户端
        binance_client = BinanceWithdrawalClient(api_key, api_secret, testnet)
        
        if binance_client.connect():
            binance_clients[session_id] = binance_client
            return jsonify({'success': True, 'message': f'API配置成功 (测试网: {testnet})'})
        else:
            return jsonify({'success': False, 'message': 'API连接失败，请检查Key和Secret'})
    
    else:
        # 获取当前配置状态
        connected = session_id in binance_clients and binance_clients[session_id].client is not None
        return jsonify({
            'connected': connected,
            'testnet': binance_clients.get(session_id, {}).testnet if connected else True
        })

@app.route('/api/account')
def api_account():
    """获取账户信息"""
    session_id = request.headers.get('X-Session-ID', 'default')
    binance_client = binance_clients.get(session_id)
    
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
    session_id = request.headers.get('X-Session-ID', 'default')
    binance_client = binance_clients.get(session_id)
    
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
    session_id = request.headers.get('X-Session-ID', 'default')
    binance_client = binance_clients.get(session_id)
    
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
    max_amount = float(os.environ.get('MAX_WITHDRAWAL_AMOUNT', '10000'))
    if amount > max_amount:
        return jsonify({
            'success': False, 
            'message': f'提币金额超过限额 {max_amount}'
        })
    
    # 执行提币
    try:
        success, message, tx_id = binance_client.withdraw(
            coin=coin,
            address=address,
            amount=amount,
            network=network,
            address_tag=address_tag
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'tx_id': tx_id
            })
        else:
            return jsonify({
                'success': False,
                'message': message
            })
            
    except Exception as e:
        error_msg = f'提币执行异常: {str(e)}'
        logger.error(error_msg)
        return jsonify({
            'success': False,
            'message': error_msg
        })

@app.route('/api/batch-withdraw', methods=['POST'])
def api_batch_withdraw():
    """批量提币"""
    session_id = request.headers.get('X-Session-ID', 'default')
    binance_client = binance_clients.get(session_id)
    
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})

    data = request.get_json()
    coin = data.get('coin', '').upper()
    network = data.get('network', '').upper()
    addresses = data.get('addresses', [])

    # 验证参数
    if not all([coin, network, addresses]):
        return jsonify({'success': False, 'message': '请填写完整的批量提币信息'})

    if len(addresses) > 10:  # Vercel限制，减少批量数量
        return jsonify({'success': False, 'message': '批量提币地址数量不能超过10个'})

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
    max_amount = float(os.environ.get('MAX_WITHDRAWAL_AMOUNT', '10000'))
    if total_amount > max_amount * 10:
        return jsonify({
            'success': False,
            'message': f'批量提币总金额超过限额 {max_amount * 10}'
        })

    # 执行批量提币
    results = []
    for addr_info in addresses:
        try:
            address = addr_info['address']
            amount = float(addr_info['amount'])
            address_tag = addr_info.get('addressTag', '') or None

            # 执行提币
            success, message, tx_id = binance_client.withdraw(
                coin=coin,
                address=address,
                amount=amount,
                network=network,
                address_tag=address_tag
            )

            results.append({
                'address': address,
                'amount': amount,
                'success': success,
                'message': message,
                'tx_id': tx_id if success else None
            })

        except Exception as e:
            results.append({
                'address': address,
                'amount': amount,
                'success': False,
                'message': str(e),
                'tx_id': None
            })

    # 统计结果
    successful = sum(1 for r in results if r['success'])
    failed = len(results) - successful

    return jsonify({
        'success': True,
        'message': f'批量提币完成: 成功{successful}个，失败{failed}个',
        'results': results
    })

@app.route('/api/smart-withdraw', methods=['POST'])
def api_smart_withdraw():
    """智能批量提币"""
    session_id = request.headers.get('X-Session-ID', 'default')
    binance_client = binance_clients.get(session_id)
    
    if not binance_client or not binance_client.client:
        return jsonify({'success': False, 'message': '请先配置API'})

    data = request.get_json()
    coin = data.get('coin', '').upper()
    network = data.get('network', '').upper()
    addresses = data.get('addresses', [])
    amount_config = data.get('amount_config', {})

    # 验证参数
    if not all([coin, network, addresses, amount_config]):
        return jsonify({'success': False, 'message': '请填写完整的智能提币信息'})

    if len(addresses) > 10:  # Vercel限制
        return jsonify({'success': False, 'message': '智能提币地址数量不能超过10个'})

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

    # 执行智能提币
    results = []
    for addr_info in addresses:
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

            # 执行提币
            success, message, tx_id = binance_client.withdraw(
                coin=coin,
                address=address,
                amount=amount,
                network=network,
                address_tag=address_tag
            )

            results.append({
                'address': address,
                'amount': amount,
                'success': success,
                'message': message,
                'tx_id': tx_id if success else None
            })

        except Exception as e:
            results.append({
                'address': address,
                'amount': amount if 'amount' in locals() else 0,
                'success': False,
                'message': str(e),
                'tx_id': None
            })

    # 统计结果
    successful = sum(1 for r in results if r['success'])
    failed = len(results) - successful

    return jsonify({
        'success': True,
        'message': f'智能提币完成: 成功{successful}个，失败{failed}个',
        'results': results
    })

@app.route('/api/ip-info')
def api_ip_info():
    """获取本机IP信息"""
    try:
        # 获取请求者IP
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if client_ip:
            client_ip = client_ip.split(',')[0].strip()

        return jsonify({
            'success': True,
            'data': {
                'client_ip': client_ip,
                'server_region': os.environ.get('VERCEL_REGION', 'unknown')
            }
        })
    except Exception as e:
        logger.error(f'获取IP信息失败: {str(e)}')
        return jsonify({'success': False, 'message': '获取IP信息失败'})

# Vercel serverless function handler
def handler(request, response):
    with app.test_request_context(
        request.url,
        method=request.method,
        headers=dict(request.headers),
        data=request.body
    ):
        try:
            rv = app.full_dispatch_request()
            response.status_code = rv.status_code
            response.headers.update(dict(rv.headers))
            response.data = rv.get_data()
        except Exception as e:
            response.status_code = 500
            response.data = str(e)
    return response