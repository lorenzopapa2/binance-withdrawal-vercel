#!/bin/bash

echo "================================================"
echo "币安提币应用 - 本地版本"
echo "================================================"
echo

echo "正在检查Python环境..."
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "❌ 错误: 未找到Python，请先安装Python 3.7+"
        echo "Ubuntu/Debian: sudo apt install python3 python3-pip"
        echo "CentOS/RHEL: sudo yum install python3 python3-pip"
        echo "macOS: brew install python3"
        exit 1
    else
        PYTHON_CMD="python"
    fi
else
    PYTHON_CMD="python3"
fi

echo "✅ Python环境检查通过"

echo
echo "正在检查依赖包..."
$PYTHON_CMD -c "import flask, binance, flask_socketio" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ 缺少依赖包，正在安装..."
    if command -v pip3 &> /dev/null; then
        pip3 install -r requirements.txt
    else
        pip install -r requirements.txt
    fi
    
    if [ $? -ne 0 ]; then
        echo "❌ 依赖包安装失败，请手动运行:"
        echo "pip3 install -r requirements.txt"
        exit 1
    fi
fi

echo "✅ 依赖包检查通过"

echo
echo "🚀 启动应用..."
echo "📱 访问地址: http://localhost:8888"
echo "🛑 按 Ctrl+C 停止应用"
echo

$PYTHON_CMD run_local.py
