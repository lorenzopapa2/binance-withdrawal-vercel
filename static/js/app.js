// 全局变量
let socket;
let isConnected = false;

// 支持的币种和网络配置
const COIN_NETWORKS = {
    'USDT': ['TRC20', 'ERC20', 'BSC', 'OPBNB'],
    'BTC': ['BTC'],
    'ETH': ['ERC20'],
    'BNB': ['BSC', 'BEP2', 'OPBNB'],
    'BUSD': ['BSC', 'ERC20']
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadApiConfig();
    refreshIPInfo();
});

// 初始化应用
function initializeApp() {
    // 初始化Socket.IO连接
    socket = io();
    
    socket.on('connect', function() {
        console.log('已连接到服务器');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log('与服务器断开连接');
        updateConnectionStatus(false);
    });
    
    socket.on('log_update', function(data) {
        addLogEntry(data.type, data.message, data.timestamp);
    });
    
    socket.on('withdrawal_update', function(data) {
        addLogEntry(
            data.status === 'FAILED' ? 'error' : 'success',
            `提币更新: ${data.message}`,
            new Date().toISOString()
        );
        refreshWithdrawalHistory();
    });
}

// 设置事件监听器
function setupEventListeners() {
    // API配置表单
    document.getElementById('api-config-form').addEventListener('submit', handleApiConfig);

    // 提币表单
    document.getElementById('withdrawal-form').addEventListener('submit', handleWithdrawal);

    // 币种选择变化
    document.getElementById('coin').addEventListener('change', updateNetworkOptions);

    // 提币模式切换
    document.getElementById('withdrawal-mode').addEventListener('change', toggleWithdrawalMode);

    // 确认提币按钮
    document.getElementById('confirm-withdraw').addEventListener('click', executeWithdrawal);
}

// 更新连接状态
function updateConnectionStatus(connected) {
    isConnected = connected;
    const statusElement = document.getElementById('connection-status');
    const icon = statusElement.querySelector('i');
    
    if (connected) {
        icon.className = 'fas fa-circle text-success';
        statusElement.innerHTML = '<i class="fas fa-circle text-success"></i> 已连接';
    } else {
        icon.className = 'fas fa-circle text-danger';
        statusElement.innerHTML = '<i class="fas fa-circle text-danger"></i> 未连接';
    }
}

// 加载API配置
async function loadApiConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.api_key) {
            document.getElementById('api-key').value = data.api_key;
        }
        document.getElementById('testnet').checked = data.testnet;
        
        if (data.connected) {
            updateConnectionStatus(true);
            refreshAccount();
            refreshWithdrawalHistory();
        }
    } catch (error) {
        console.error('加载API配置失败:', error);
    }
}

// 处理API配置
async function handleApiConfig(event) {
    event.preventDefault();
    
    const apiKey = document.getElementById('api-key').value.trim();
    const apiSecret = document.getElementById('api-secret').value.trim();
    const testnet = document.getElementById('testnet').checked;
    
    if (!apiKey || !apiSecret) {
        showAlert('请填写完整的API信息', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                api_key: apiKey,
                api_secret: apiSecret,
                testnet: testnet
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('API配置成功', 'success');
            updateConnectionStatus(true);
            refreshAccount();
            document.getElementById('api-secret').value = ''; // 清空密钥输入
        } else {
            showAlert(data.message, 'danger');
            updateConnectionStatus(false);
        }
    } catch (error) {
        showAlert('配置失败: ' + error.message, 'danger');
        updateConnectionStatus(false);
    }
}

// 刷新账户信息
async function refreshAccount() {
    try {
        const response = await fetch('/api/account');
        const data = await response.json();
        
        if (data.success) {
            displayAccountInfo(data.data);
        } else {
            document.getElementById('account-info').innerHTML = 
                '<p class="text-danger">' + data.message + '</p>';
        }
    } catch (error) {
        document.getElementById('account-info').innerHTML = 
            '<p class="text-danger">获取账户信息失败</p>';
    }
}

// 显示账户信息
function displayAccountInfo(accountData) {
    const accountDiv = document.getElementById('account-info');
    
    let html = `
        <div class="mb-3">
            <small class="text-muted">账户类型:</small>
            <span class="badge bg-primary">${accountData.account_type}</span>
        </div>
        <div class="mb-3">
            <small class="text-muted">权限:</small>
            <span class="badge ${accountData.can_trade ? 'bg-success' : 'bg-secondary'}">交易</span>
            <span class="badge ${accountData.can_withdraw ? 'bg-success' : 'bg-secondary'}">提币</span>
            <span class="badge ${accountData.can_deposit ? 'bg-success' : 'bg-secondary'}">充值</span>
        </div>
        <div class="mb-3">
            <small class="text-muted">主要余额:</small>
        </div>
    `;
    
    // 显示主要余额
    const mainBalances = accountData.balances.filter(b => 
        ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD'].includes(b.asset) && b.free > 0
    ).slice(0, 5);
    
    if (mainBalances.length > 0) {
        mainBalances.forEach(balance => {
            html += `
                <div class="balance-item">
                    <span class="balance-asset">${balance.asset}</span>
                    <span class="balance-amount">${balance.free.toFixed(8)}</span>
                </div>
            `;
        });
    } else {
        html += '<p class="text-muted">无可用余额</p>';
    }
    
    accountDiv.innerHTML = html;
}

// 更新网络选项
function updateNetworkOptions() {
    const coin = document.getElementById('coin').value;
    const networkSelect = document.getElementById('network');
    
    networkSelect.innerHTML = '<option value="">选择网络</option>';
    
    if (coin && COIN_NETWORKS[coin]) {
        COIN_NETWORKS[coin].forEach(network => {
            const option = document.createElement('option');
            option.value = network;
            option.textContent = network;
            networkSelect.appendChild(option);
        });
    }
}

// 处理提币表单
function handleWithdrawal(event) {
    event.preventDefault();

    const coin = document.getElementById('coin').value;
    const network = document.getElementById('network').value;
    const withdrawalMode = document.getElementById('withdrawal-mode').value;
    const addressText = document.getElementById('address-list').value.trim();

    // 基本验证
    if (!coin || !network) {
        showAlert('请选择币种和网络', 'warning');
        return;
    }

    if (!addressText) {
        showAlert('请输入提币地址列表', 'warning');
        return;
    }

    if (!validateAddressList()) {
        showAlert('地址格式验证失败，请检查输入', 'warning');
        return;
    }

    // 解析地址列表
    const addresses = parseAddressList(addressText);

    // 获取数量配置
    let amountConfig = {};
    if (withdrawalMode === 'random') {
        const minAmount = document.getElementById('min-amount').value;
        const maxAmount = document.getElementById('max-amount').value;

        if (!minAmount || !maxAmount || parseFloat(minAmount) >= parseFloat(maxAmount)) {
            showAlert('请正确设置随机数量区间', 'warning');
            return;
        }

        amountConfig = {
            mode: 'random',
            min: parseFloat(minAmount),
            max: parseFloat(maxAmount)
        };
    } else {
        const fixedAmount = document.getElementById('fixed-amount').value;

        if (!fixedAmount || parseFloat(fixedAmount) <= 0) {
            showAlert('请设置固定提币数量', 'warning');
            return;
        }

        amountConfig = {
            mode: 'fixed',
            amount: parseFloat(fixedAmount)
        };
    }

    // 获取时间间隔配置
    const minInterval = document.getElementById('min-interval').value || '1';
    const maxInterval = document.getElementById('max-interval').value || '5';

    const intervalConfig = {
        min: parseInt(minInterval),
        max: parseInt(maxInterval)
    };

    // 显示确认对话框
    showSmartWithdrawalConfirmation({
        coin: coin,
        network: network,
        addresses: addresses,
        amountConfig: amountConfig,
        intervalConfig: intervalConfig
    });
}

// 解析地址列表
function parseAddressList(addressText) {
    const lines = addressText.split('\n').filter(line => line.trim());
    return lines.map(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;

        const parts = trimmedLine.split(',');
        return {
            address: parts[0].trim(),
            tag: parts[1] ? parts[1].trim() : ''
        };
    }).filter(item => item !== null);
}

// 显示智能提币确认对话框
function showSmartWithdrawalConfirmation(config) {
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    const detailsDiv = document.getElementById('confirm-details');

    // 计算预估信息
    let amountInfo = '';
    if (config.amountConfig.mode === 'random') {
        amountInfo = `随机数量: ${config.amountConfig.min} - ${config.amountConfig.max}`;
    } else {
        amountInfo = `固定数量: ${config.amountConfig.amount}`;
    }

    const intervalInfo = `时间间隔: ${config.intervalConfig.min} - ${config.intervalConfig.max} 秒`;
    const totalTime = config.addresses.length * ((config.intervalConfig.min + config.intervalConfig.max) / 2);

    let addressListHtml = '';
    config.addresses.forEach((addr, index) => {
        addressListHtml += `
            <tr>
                <td>${index + 1}</td>
                <td class="text-break" style="max-width: 200px;">${addr.address}</td>
                <td>${addr.tag || '-'}</td>
            </tr>
        `;
    });

    detailsDiv.innerHTML = `
        <div class="alert alert-info">
            <h6><strong>智能批量提币确认</strong></h6>
            <div class="row">
                <div class="col-md-6">
                    <small><strong>币种:</strong> ${config.coin}</small><br>
                    <small><strong>网络:</strong> ${config.network}</small><br>
                    <small><strong>地址数:</strong> ${config.addresses.length}</small>
                </div>
                <div class="col-md-6">
                    <small><strong>${amountInfo}</strong></small><br>
                    <small><strong>${intervalInfo}</strong></small><br>
                    <small><strong>预计耗时:</strong> ${Math.ceil(totalTime / 60)} 分钟</small>
                </div>
            </div>
        </div>
        <div style="max-height: 300px; overflow-y: auto;">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>地址</th>
                        <th>标签</th>
                    </tr>
                </thead>
                <tbody>
                    ${addressListHtml}
                </tbody>
            </table>
        </div>
    `;

    // 保存配置到确认按钮
    document.getElementById('confirm-withdraw').onclick = () => executeSmartWithdrawal(config);

    modal.show();
}

// 显示提币确认对话框
function showWithdrawalConfirmation(withdrawalData) {
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    const detailsDiv = document.getElementById('confirm-details');

    detailsDiv.innerHTML = `
        <table class="table table-sm">
            <tr><td><strong>币种:</strong></td><td>${withdrawalData.coin}</td></tr>
            <tr><td><strong>网络:</strong></td><td>${withdrawalData.network}</td></tr>
            <tr><td><strong>地址:</strong></td><td class="text-break">${withdrawalData.address}</td></tr>
            <tr><td><strong>数量:</strong></td><td>${withdrawalData.amount}</td></tr>
            ${withdrawalData.addressTag ? `<tr><td><strong>地址标签:</strong></td><td>${withdrawalData.addressTag}</td></tr>` : ''}
        </table>
    `;

    // 保存提币数据到确认按钮
    document.getElementById('confirm-withdraw').onclick = () => executeWithdrawal(withdrawalData);

    modal.show();
}

// 显示批量提币确认对话框
function showBatchWithdrawalConfirmation(batchData) {
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    const detailsDiv = document.getElementById('confirm-details');

    const totalAmount = batchData.addresses.reduce((sum, addr) => sum + addr.amount, 0);

    let addressListHtml = '';
    batchData.addresses.forEach((addr, index) => {
        addressListHtml += `
            <tr>
                <td>${index + 1}</td>
                <td class="text-break" style="max-width: 200px;">${addr.address}</td>
                <td>${addr.amount}</td>
                <td>${addr.addressTag || '-'}</td>
            </tr>
        `;
    });

    detailsDiv.innerHTML = `
        <div class="alert alert-info">
            <strong>批量提币确认</strong><br>
            币种: ${batchData.coin} | 网络: ${batchData.network}<br>
            总地址数: ${batchData.addresses.length} | 总金额: ${totalAmount}
        </div>
        <div style="max-height: 300px; overflow-y: auto;">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>地址</th>
                        <th>数量</th>
                        <th>标签</th>
                    </tr>
                </thead>
                <tbody>
                    ${addressListHtml}
                </tbody>
            </table>
        </div>
    `;

    // 保存批量提币数据到确认按钮
    document.getElementById('confirm-withdraw').onclick = () => executeBatchWithdrawal(batchData);

    modal.show();
}

// 执行提币
async function executeWithdrawal(withdrawalData) {
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
    modal.hide();

    try {
        const response = await fetch('/api/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coin: withdrawalData.coin,
                network: withdrawalData.network,
                address: withdrawalData.address,
                amount: withdrawalData.amount,
                address_tag: withdrawalData.addressTag
            })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(data.message, 'success');
            document.getElementById('withdrawal-form').reset();
            updateNetworkOptions(); // 重置网络选项
        } else {
            showAlert(data.message, 'danger');
        }
    } catch (error) {
        showAlert('提币请求失败: ' + error.message, 'danger');
    }
}

// 执行智能提币
async function executeSmartWithdrawal(config) {
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
    modal.hide();

    showAlert(`开始智能批量提币，共${config.addresses.length}个地址`, 'info');

    try {
        const response = await fetch('/api/smart-withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coin: config.coin,
                network: config.network,
                addresses: config.addresses,
                amount_config: config.amountConfig,
                interval_config: config.intervalConfig
            })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`智能提币任务已启动，任务ID: ${data.task_id}`, 'success');
            document.getElementById('withdrawal-form').reset();
            updateNetworkOptions(); // 重置网络选项

            // 重置为默认状态
            document.getElementById('withdrawal-mode').value = 'fixed';
            toggleWithdrawalMode();
        } else {
            showAlert(data.message, 'danger');
        }
    } catch (error) {
        showAlert('智能提币请求失败: ' + error.message, 'danger');
    }
}

// 刷新提币历史
async function refreshWithdrawalHistory() {
    try {
        const response = await fetch('/api/withdrawal-history');
        const data = await response.json();
        
        if (data.success) {
            displayWithdrawalHistory(data.data);
        }
    } catch (error) {
        console.error('获取提币历史失败:', error);
    }
}

// 显示提币历史
function displayWithdrawalHistory(history) {
    const tbody = document.getElementById('withdrawal-history');
    
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = history.map(record => `
        <tr>
            <td>${new Date(record.created_at).toLocaleString()}</td>
            <td>${record.coin}</td>
            <td>${record.network}</td>
            <td>${record.amount}</td>
            <td><span class="badge status-${record.status.toLowerCase()}">${record.status}</span></td>
            <td class="text-break" style="max-width: 150px;">
                ${record.tx_id ? `<small>${record.tx_id}</small>` : '-'}
            </td>
        </tr>
    `).join('');
}

// 添加日志条目
function addLogEntry(type, message, timestamp) {
    const logsDiv = document.getElementById('real-time-logs');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type} fade-in`;
    
    const time = new Date(timestamp).toLocaleTimeString();
    logEntry.innerHTML = `<small>[${time}]</small> ${message}`;
    
    logsDiv.appendChild(logEntry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
    
    // 限制日志条目数量
    const entries = logsDiv.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[0].remove();
    }
}

// 清空日志
function clearLogs() {
    document.getElementById('real-time-logs').innerHTML = '<div class="text-muted">日志已清空</div>';
}

// 获取IP信息
async function refreshIPInfo() {
    try {
        const response = await fetch('/api/ip-info');
        const data = await response.json();

        if (data.success) {
            displayIPInfo(data.data);
        } else {
            document.getElementById('ip-info').innerHTML =
                '<p class="text-danger">获取IP信息失败</p>';
        }
    } catch (error) {
        document.getElementById('ip-info').innerHTML =
            '<p class="text-danger">获取IP信息失败</p>';
    }
}

// 显示IP信息
function displayIPInfo(ipData) {
    const ipDiv = document.getElementById('ip-info');

    let html = '';

    if (ipData.local_ip) {
        html += `
            <div class="mb-2">
                <small class="text-muted">内网IP:</small>
                <div class="d-flex align-items-center">
                    <code class="me-2">${ipData.local_ip}</code>
                    <button class="btn btn-sm btn-outline-secondary" onclick="copyToClipboard('${ipData.local_ip}')">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        `;
    }

    if (ipData.public_ip) {
        html += `
            <div class="mb-2">
                <small class="text-muted">外网IP:</small>
                <div class="d-flex align-items-center">
                    <code class="me-2">${ipData.public_ip}</code>
                    <button class="btn btn-sm btn-outline-secondary" onclick="copyToClipboard('${ipData.public_ip}')">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        `;
    }

    ipDiv.innerHTML = html || '<p class="text-muted">无法获取IP信息</p>';
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('IP地址已复制到剪贴板', 'success');
    }).catch(() => {
        showAlert('复制失败，请手动复制', 'warning');
    });
}

// 切换提币模式
function toggleWithdrawalMode() {
    const mode = document.getElementById('withdrawal-mode').value;
    const fixedConfig = document.getElementById('fixed-amount-config');
    const randomConfig = document.getElementById('random-amount-config');

    if (mode === 'random') {
        fixedConfig.style.display = 'none';
        randomConfig.style.display = 'block';
    } else {
        fixedConfig.style.display = 'block';
        randomConfig.style.display = 'none';
    }
}

// 验证地址列表格式
function validateAddressList() {
    const addressText = document.getElementById('address-list').value.trim();
    const resultSpan = document.getElementById('address-validation-result');

    if (!addressText) {
        resultSpan.innerHTML = '<span class="text-warning">请输入地址</span>';
        return false;
    }

    const lines = addressText.split('\n').filter(line => line.trim());
    let validCount = 0;
    let errors = [];

    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        const parts = trimmedLine.split(',');
        const address = parts[0].trim();

        // 基本地址格式验证
        if (!address) {
            errors.push(`第${index + 1}行: 地址不能为空`);
        } else if (address.length < 20) {
            errors.push(`第${index + 1}行: 地址格式可能不正确`);
        } else {
            validCount++;
        }
    });

    if (errors.length > 0) {
        resultSpan.innerHTML = `<span class="text-danger">发现${errors.length}个错误</span>`;
        console.log('验证错误:', errors);
    } else {
        resultSpan.innerHTML = `<span class="text-success">验证通过，共${validCount}个地址</span>`;
    }

    return errors.length === 0;
}

// 生成随机数量
function generateRandomAmount(min, max) {
    const minAmount = parseFloat(min);
    const maxAmount = parseFloat(max);

    if (isNaN(minAmount) || isNaN(maxAmount) || minAmount >= maxAmount) {
        return null;
    }

    // 生成随机数，保留8位小数
    const randomAmount = Math.random() * (maxAmount - minAmount) + minAmount;
    return Math.round(randomAmount * 100000000) / 100000000;
}

// 生成随机间隔时间
function generateRandomInterval(min, max) {
    const minInterval = parseInt(min);
    const maxInterval = parseInt(max);

    if (isNaN(minInterval) || isNaN(maxInterval) || minInterval >= maxInterval) {
        return 1000; // 默认1秒
    }

    return Math.floor(Math.random() * (maxInterval - minInterval + 1) + minInterval) * 1000;
}

// 显示警告消息
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.querySelector('.container').insertBefore(alertDiv, document.querySelector('.container').firstChild);

    // 自动消失
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}
