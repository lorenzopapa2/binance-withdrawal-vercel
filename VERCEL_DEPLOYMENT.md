# Vercel部署指南

## 重要说明

这是原始的Flask版本，包含WebSocket功能。由于Vercel不支持WebSocket，部署到Vercel后某些实时功能可能无法正常工作。

如果需要完整功能，建议：
1. 使用专门为Vercel优化的版本（binance-withdrawal-vercel-v2）
2. 或部署到支持WebSocket的平台（如Heroku、Railway等）

## 部署步骤

### 1. 登录Vercel

访问 [https://vercel.com](https://vercel.com) 并登录你的账户。

### 2. 导入项目

1. 点击 "New Project"
2. 选择 "Import Git Repository"
3. 选择 `lorenzopapa2/binance-withdrawal-original`

### 3. 配置环境变量

在部署配置页面，添加以下环境变量：

```
BINANCE_API_KEY=你的API密钥
BINANCE_API_SECRET=你的API密码
BINANCE_TESTNET=True
SECRET_KEY=你的密钥
MAX_WITHDRAWAL_AMOUNT=1000
DATABASE_PATH=/tmp/withdrawal_logs.db
```

### 4. 部署设置

- Framework Preset: Other
- Build Command: 留空或 `pip install -r requirements.txt`
- Output Directory: 留空
- Install Command: `pip install -r requirements.txt`

### 5. 部署

点击 "Deploy" 开始部署。

## 已知限制

由于Vercel的限制，以下功能可能受影响：

1. **WebSocket实时更新** - 不支持
2. **SQLite数据库** - 只能使用临时存储，重启后数据会丢失
3. **后台任务** - 有执行时间限制

## 建议

如果需要完整功能，推荐使用以下替代方案：

1. **使用Vercel优化版本**：https://github.com/lorenzopapa2/binance-withdrawal-vercel-v2
2. **部署到其他平台**：
   - Railway.app
   - Render.com
   - Heroku
   - 自建VPS

## 本地测试

在部署前，建议先在本地测试：

```bash
# 安装依赖
pip install -r requirements.txt

# 运行应用
python app.py
```

访问 http://localhost:8888 查看应用。