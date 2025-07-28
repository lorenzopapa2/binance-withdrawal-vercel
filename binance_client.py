import logging
from typing import Dict, List, Optional, Tuple
from binance.client import Client
from binance.exceptions import BinanceAPIException, BinanceOrderException
import time

class BinanceWithdrawalClient:
    """Binance提币客户端封装类"""
    
    def __init__(self, api_key: str, api_secret: str, testnet: bool = True):
        """
        初始化Binance客户端
        
        Args:
            api_key: Binance API Key
            api_secret: Binance API Secret
            testnet: 是否使用测试网络
        """
        self.api_key = api_key
        self.api_secret = api_secret
        self.testnet = testnet
        self.client = None
        self.logger = logging.getLogger(__name__)
        
        if api_key and api_secret:
            self.connect()
    
    def connect(self) -> bool:
        """连接到Binance API"""
        try:
            self.client = Client(
                api_key=self.api_key,
                api_secret=self.api_secret,
                testnet=self.testnet
            )
            
            # 测试连接
            account_info = self.client.get_account()
            self.logger.info(f"成功连接到Binance API (测试网: {self.testnet})")
            return True
            
        except Exception as e:
            self.logger.error(f"连接Binance API失败: {str(e)}")
            self.client = None
            return False
    
    def get_account_info(self) -> Optional[Dict]:
        """获取账户信息"""
        if not self.client:
            return None
            
        try:
            account_info = self.client.get_account()
            return {
                'account_type': account_info.get('accountType'),
                'can_trade': account_info.get('canTrade'),
                'can_withdraw': account_info.get('canWithdraw'),
                'can_deposit': account_info.get('canDeposit'),
                'balances': [
                    {
                        'asset': balance['asset'],
                        'free': float(balance['free']),
                        'locked': float(balance['locked'])
                    }
                    for balance in account_info['balances']
                    if float(balance['free']) > 0 or float(balance['locked']) > 0
                ]
            }
        except Exception as e:
            self.logger.error(f"获取账户信息失败: {str(e)}")
            return None
    
    def get_balance(self, asset: str) -> Optional[Dict]:
        """获取指定资产余额"""
        if not self.client:
            return None
            
        try:
            balance = self.client.get_asset_balance(asset=asset)
            if balance:
                return {
                    'asset': balance['asset'],
                    'free': float(balance['free']),
                    'locked': float(balance['locked'])
                }
            return None
        except Exception as e:
            self.logger.error(f"获取{asset}余额失败: {str(e)}")
            return None
    
    def get_deposit_address(self, coin: str, network: str = None) -> Optional[Dict]:
        """获取充值地址"""
        if not self.client:
            return None
            
        try:
            result = self.client.get_deposit_address(coin=coin, network=network)
            return {
                'address': result.get('address'),
                'tag': result.get('tag'),
                'coin': result.get('coin'),
                'network': result.get('network')
            }
        except Exception as e:
            self.logger.error(f"获取{coin}充值地址失败: {str(e)}")
            return None
    
    def withdraw(self, coin: str, address: str, amount: float, 
                network: str = None, address_tag: str = None) -> Tuple[bool, str, Optional[str]]:
        """
        执行提币操作
        
        Args:
            coin: 币种
            address: 提币地址
            amount: 提币数量
            network: 网络类型
            address_tag: 地址标签(如果需要)
            
        Returns:
            (成功状态, 消息, 交易ID)
        """
        if not self.client:
            return False, "未连接到Binance API", None
            
        try:
            # 检查余额
            balance = self.get_balance(coin)
            if not balance or balance['free'] < amount:
                return False, f"余额不足，当前可用余额: {balance['free'] if balance else 0}", None
            
            # 执行提币
            withdraw_params = {
                'coin': coin,
                'address': address,
                'amount': amount
            }
            
            if network:
                withdraw_params['network'] = network
            if address_tag:
                withdraw_params['addressTag'] = address_tag
                
            result = self.client.withdraw(**withdraw_params)
            
            tx_id = result.get('id')
            self.logger.info(f"提币成功: {coin} {amount} -> {address}, 交易ID: {tx_id}")
            
            return True, "提币请求已提交", tx_id
            
        except BinanceAPIException as e:
            error_msg = f"Binance API错误: {e.message} (代码: {e.code})"
            self.logger.error(error_msg)
            return False, error_msg, None
            
        except Exception as e:
            error_msg = f"提币失败: {str(e)}"
            self.logger.error(error_msg)
            return False, error_msg, None
    
    def get_withdraw_history(self, coin: str = None, limit: int = 100) -> Optional[List[Dict]]:
        """获取提币历史"""
        if not self.client:
            return None
            
        try:
            params = {'limit': limit}
            if coin:
                params['coin'] = coin
                
            history = self.client.get_withdraw_history(**params)
            
            return [
                {
                    'id': item.get('id'),
                    'coin': item.get('coin'),
                    'network': item.get('network'),
                    'address': item.get('address'),
                    'amount': float(item.get('amount', 0)),
                    'fee': float(item.get('transactionFee', 0)),
                    'status': item.get('status'),
                    'tx_id': item.get('txId'),
                    'apply_time': item.get('applyTime'),
                    'complete_time': item.get('completeTime')
                }
                for item in history
            ]
            
        except Exception as e:
            self.logger.error(f"获取提币历史失败: {str(e)}")
            return None
    
    def get_withdraw_fee(self, coin: str, network: str = None) -> Optional[float]:
        """获取提币手续费"""
        if not self.client:
            return None
            
        try:
            # 注意: 这个方法可能需要根据实际API调整
            # Binance API可能没有直接获取手续费的接口
            # 可以通过其他方式获取或使用预设值
            fees = self.client.get_trade_fee(symbol=f"{coin}USDT")
            return float(fees[0]['withdrawFee']) if fees else None
            
        except Exception as e:
            self.logger.error(f"获取{coin}提币手续费失败: {str(e)}")
            return None
