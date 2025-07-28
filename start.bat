@echo off
chcp 65001 >nul
title 币安提币应用

echo ================================================
echo 币安提币应用 - 本地版本
echo ================================================
echo.

echo 正在检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到Python，请先安装Python 3.7+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo ✅ Python环境检查通过

echo.
echo 正在检查依赖包...
python -c "import flask, binance, flask_socketio" >nul 2>&1
if errorlevel 1 (
    echo ❌ 缺少依赖包，正在安装...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ 依赖包安装失败，请手动运行: pip install -r requirements.txt
        pause
        exit /b 1
    )
)

echo ✅ 依赖包检查通过

echo.
echo 🚀 启动应用...
echo 📱 访问地址: http://localhost:8888
echo 🛑 按 Ctrl+C 停止应用
echo.

python run_local.py

pause
