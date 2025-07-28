import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional

class DatabaseManager:
    """数据库管理类"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """初始化数据库表"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 创建提币记录表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS withdrawal_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    coin TEXT NOT NULL,
                    network TEXT NOT NULL,
                    address TEXT NOT NULL,
                    amount REAL NOT NULL,
                    fee REAL NOT NULL,
                    status TEXT NOT NULL,
                    tx_id TEXT,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 创建操作日志表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS operation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    operation TEXT NOT NULL,
                    details TEXT,
                    status TEXT NOT NULL,
                    error_message TEXT
                )
            ''')
            
            # 创建配置表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS app_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
    
    def add_withdrawal_log(self, coin: str, network: str, address: str, 
                          amount: float, fee: float, status: str, 
                          tx_id: str = None, error_message: str = None) -> int:
        """添加提币记录"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO withdrawal_logs 
                (coin, network, address, amount, fee, status, tx_id, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (coin, network, address, amount, fee, status, tx_id, error_message))
            conn.commit()
            return cursor.lastrowid
    
    def update_withdrawal_status(self, log_id: int, status: str, 
                               tx_id: str = None, error_message: str = None):
        """更新提币状态"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE withdrawal_logs 
                SET status = ?, tx_id = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (status, tx_id, error_message, log_id))
            conn.commit()
    
    def get_withdrawal_logs(self, limit: int = 100) -> List[Dict]:
        """获取提币记录"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM withdrawal_logs 
                ORDER BY created_at DESC 
                LIMIT ?
            ''', (limit,))
            return [dict(row) for row in cursor.fetchall()]
    
    def add_operation_log(self, operation: str, details: str = None, 
                         status: str = 'SUCCESS', error_message: str = None):
        """添加操作日志"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO operation_logs (operation, details, status, error_message)
                VALUES (?, ?, ?, ?)
            ''', (operation, details, status, error_message))
            conn.commit()
    
    def get_operation_logs(self, limit: int = 100) -> List[Dict]:
        """获取操作日志"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM operation_logs 
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (limit,))
            return [dict(row) for row in cursor.fetchall()]
    
    def save_config(self, key: str, value: str):
        """保存配置"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO app_config (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            ''', (key, value))
            conn.commit()
    
    def get_config(self, key: str) -> Optional[str]:
        """获取配置"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM app_config WHERE key = ?', (key,))
            result = cursor.fetchone()
            return result[0] if result else None
