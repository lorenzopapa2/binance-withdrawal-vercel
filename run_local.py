#!/usr/bin/env python3
"""
币安提币应用 - 本地运行版本
启动脚本
"""

import os
import sys

def main():
    print("=" * 50)
    print("币安提币应用 - 本地版本")
    print("=" * 50)
    print()
    
    # 检查Python版本
    if sys.version_info < (3, 7):
        print("❌ 错误: 需要Python 3.7或更高版本")
        print(f"当前版本: {sys.version}")
        return
    
    print(f"✅ Python版本: {sys.version}")
    
    # 检查依赖
    try:
        import flask
        import binance
        import flask_socketio
        print("✅ 依赖包检查通过")
    except ImportError as e:
        print(f"❌ 缺少依赖包: {e}")
        print("请运行: pip install -r requirements.txt")
        return
    
    # 创建必要的目录
    os.makedirs('logs', exist_ok=True)
    print("✅ 日志目录已创建")
    
    print()
    print("🚀 启动应用...")
    print("📱 访问地址: http://localhost:8888")
    print("🛑 按 Ctrl+C 停止应用")
    print()
    
    # 启动应用
    from app import socketio, app
    socketio.run(app, debug=True, host='0.0.0.0', port=8888)

if __name__ == '__main__':
    main()
