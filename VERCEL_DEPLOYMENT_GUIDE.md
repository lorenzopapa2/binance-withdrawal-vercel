# Vercel部署指南

本文档介绍如何将币安提币系统部署到Vercel。

## 部署前准备

1. **GitHub账号**: 确保您有GitHub账号
2. **Vercel账号**: 在 [vercel.com](https://vercel.com) 注册账号
3. **Binance API**: 准备好您的Binance API Key和Secret

## 部署步骤

### 1. 推送代码到GitHub

```bash
git add .
git commit -m "Add Vercel deployment configuration"
git push origin main
```

### 2. 在Vercel部署

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Import Project"
3. 选择 "Import Git Repository"
4. 选择您的GitHub仓库
5. 配置项目:
   - Framework Preset: Other
   - Root Directory: ./
   - Build Command: 留空
   - Output Directory: 留空

### 3. 配置环境变量

在Vercel项目设置中添加以下环境变量:

- `SECRET_KEY`: 设置一个随机的密钥（用于Flask会话）
- `MAX_WITHDRAWAL_AMOUNT`: 最大提币限额（默认10000）

### 4. 部署完成

部署完成后，Vercel会提供一个URL访问您的应用。

## 注意事项

1. **无WebSocket支持**: Vercel不支持WebSocket，所以实时日志功能已被移除
2. **会话管理**: 使用本地存储的Session ID来管理用户会话
3. **API限制**: 
   - 函数执行时间限制为30秒
   - 批量提币数量限制为10个地址
4. **安全建议**: 
   - 不要在代码中硬编码API密钥
   - 定期更换SECRET_KEY
   - 使用强密码保护您的Vercel账号

## 功能调整

相比本地版本，Vercel版本有以下调整:

1. 移除了WebSocket实时通信
2. 移除了本地数据库存储
3. 批量提币数量限制从100个减少到10个
4. 移除了操作日志持久化存储

## 故障排除

### 部署失败
- 检查requirements.txt是否正确
- 确保vercel.json配置正确

### API连接失败
- 确认Binance API Key和Secret正确
- 检查IP白名单设置

### 提币失败
- 确认账户余额充足
- 检查提币地址格式
- 确认网络选择正确

## 更新部署

当您更新代码后:

```bash
git add .
git commit -m "Update features"
git push origin main
```

Vercel会自动检测到更新并重新部署。