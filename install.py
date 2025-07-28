#!/usr/bin/env python3
"""
币安提币应用 - 安装脚本
自动安装依赖并进行环境检查
"""

import os
import sys
import subprocess
import platform

def run_command(command):
    """运行命令并返回结果"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

def check_python_version():
    """检查Python版本"""
    print("🔍 检查Python版本...")
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 7):
        print(f"❌ Python版本过低: {version.major}.{version.minor}")
        print("需要Python 3.7或更高版本")
        return False
    
    print(f"✅ Python版本: {version.major}.{version.minor}.{version.micro}")
    return True

def install_dependencies():
    """安装依赖包"""
    print("\n📦 安装依赖包...")
    
    # 检查pip
    success, _, _ = run_command("pip --version")
    if not success:
        print("❌ pip未找到，请先安装pip")
        return False
    
    # 安装依赖
    print("正在安装依赖包...")
    success, stdout, stderr = run_command("pip install -r requirements.txt")
    
    if success:
        print("✅ 依赖包安装成功")
        return True
    else:
        print(f"❌ 依赖包安装失败: {stderr}")
        return False

def create_directories():
    """创建必要的目录"""
    print("\n📁 创建必要目录...")
    
    directories = ['logs']
    
    for directory in directories:
        try:
            os.makedirs(directory, exist_ok=True)
            print(f"✅ 创建目录: {directory}")
        except Exception as e:
            print(f"❌ 创建目录失败 {directory}: {e}")
            return False
    
    return True

def check_dependencies():
    """检查依赖包是否正确安装"""
    print("\n🔍 检查依赖包...")
    
    required_packages = [
        'flask',
        'binance',
        'flask_socketio',
        'requests',
        'cryptography',
        'python_dotenv'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
            print(f"✅ {package}")
        except ImportError:
            print(f"❌ {package}")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n❌ 缺少依赖包: {', '.join(missing_packages)}")
        return False
    
    print("\n✅ 所有依赖包检查通过")
    return True

def show_usage_info():
    """显示使用说明"""
    print("\n" + "="*50)
    print("🎉 安装完成！")
    print("="*50)
    print()
    print("📖 使用说明:")
    print()
    
    system = platform.system()
    if system == "Windows":
        print("Windows用户:")
        print("  双击 start.bat 启动应用")
        print("  或运行: python run_local.py")
    else:
        print("Linux/macOS用户:")
        print("  运行: ./start.sh")
        print("  或运行: python3 run_local.py")
    
    print()
    print("📱 访问地址: http://localhost:8888")
    print()
    print("⚠️  重要提醒:")
    print("  1. 首次使用请先配置币安API")
    print("  2. 建议先在测试网络中测试")
    print("  3. 妥善保管API密钥")
    print()

def main():
    """主函数"""
    print("="*50)
    print("币安提币应用 - 安装程序")
    print("="*50)
    
    # 检查Python版本
    if not check_python_version():
        return False
    
    # 创建目录
    if not create_directories():
        return False
    
    # 安装依赖
    if not install_dependencies():
        return False
    
    # 检查依赖
    if not check_dependencies():
        return False
    
    # 显示使用说明
    show_usage_info()
    
    return True

if __name__ == '__main__':
    try:
        success = main()
        if not success:
            print("\n❌ 安装失败，请检查错误信息")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n⚠️ 安装被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 安装过程中发生错误: {e}")
        sys.exit(1)
