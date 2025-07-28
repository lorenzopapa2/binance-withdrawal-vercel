import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """应用配置类"""
    
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-here'
    
    # Binance API配置
    BINANCE_API_KEY = os.environ.get('BINANCE_API_KEY') or ''
    BINANCE_API_SECRET = os.environ.get('BINANCE_API_SECRET') or ''
    BINANCE_TESTNET = os.environ.get('BINANCE_TESTNET', 'True').lower() == 'true'
    
    # 数据库配置
    DATABASE_PATH = 'withdrawal_logs.db'
    
    # 日志配置
    LOG_LEVEL = 'INFO'
    LOG_FILE = 'logs/app.log'
    
    # 提币安全配置
    MAX_WITHDRAWAL_AMOUNT = float(os.environ.get('MAX_WITHDRAWAL_AMOUNT', '1000'))
    REQUIRE_CONFIRMATION = os.environ.get('REQUIRE_CONFIRMATION', 'True').lower() == 'true'
    
    # 支持的币种和网络
    SUPPORTED_COINS = {
        'USDT': ['TRC20', 'ERC20', 'BSC', 'OPBNB'],
        'BTC': ['BTC'],
        'ETH': ['ERC20'],
        'BNB': ['BSC', 'BEP2', 'OPBNB'],
        'BUSD': ['BSC', 'ERC20']
    }
    
    # 网络费用配置
    NETWORK_FEES = {
        'TRC20': 1.0,
        'ERC20': 15.0,
        'BSC': 0.5,
        'BTC': 0.0005,
        'BEP2': 0.000375,
        'OPBNB': 0.00001
    }

class DevelopmentConfig(Config):
    """开发环境配置"""
    DEBUG = True
    BINANCE_TESTNET = True

class ProductionConfig(Config):
    """生产环境配置"""
    DEBUG = False
    BINANCE_TESTNET = False

# 配置字典
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
