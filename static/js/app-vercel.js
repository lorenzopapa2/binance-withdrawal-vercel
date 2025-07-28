// 全局变量
let sessionId = localStorage.getItem('sessionId') || generateSessionId();
localStorage.setItem('sessionId', sessionId);

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

// 生成会话ID
function generateSessionId() {
    return 'session-' + Math.random().toString(36).substr(2, 9);
}

// 初始化应用
function initializeApp() {
    console.log('应用初始化完成');
    updateConnectionStatus(true);
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
    const statusElement = document.getElementById('connection-status');
    
    if (connected) {
        statusElement.innerHTML = '<i class="fas fa-circle text-success"></i> 已连接';
    } else {
        statusElement.innerHTML = '<i class="fas fa-circle text-danger"></i> 未连接';
    }
}

// 发送带会话ID的请求
async function fetchWithSession(url, options = {}) {
    const headers = {
        'X-Session-ID': sessionId,
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    return fetch(url, {
        ...options,
        headers
    });
}

// 加载API配置
async function loadApiConfig() {
    try {
        const response = await fetchWithSession('/api/config');
        const data = await response.json();
        
        if (data.api_key) {
            document.getElementById('api-key').value = data.api_key;
        }
        document.getElementById('testnet').checked = data.testnet;
        
        if (data.connected) {
            updateConnectionStatus(true);
            refreshAccount();
        }
    } catch (error) {
        console.error('加载API配置失败:', error);
        showToast('加载API配置失败', 'error');
    }
}

// 处理API配置
async function handleApiConfig(event) {
    event.preventDefault();
    
    const apiKey = document.getElementById('api-key').value.trim();
    const apiSecret = document.getElementById('api-secret').value.trim();
    const testnet = document.getElementById('testnet').checked;
    
    if (!apiKey || !apiSecret) {
        showToast('请填写API Key和Secret', 'error');
        return;
    }
    
    try {
        const response = await fetchWithSession('/api/config', {
            method: 'POST',
            body: JSON.stringify({
                api_key: apiKey,
                api_secret: apiSecret,
                testnet: testnet
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            document.getElementById('api-secret').value = '';
            refreshAccount();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('配置API失败:', error);
        showToast('配置API失败: ' + error.message, 'error');
    }
}

// 刷新账户信息
async function refreshAccount() {
    try {
        const response = await fetchWithSession('/api/account');
        const data = await response.json();
        
        if (data.success) {
            displayAccountInfo(data.data);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('获取账户信息失败:', error);
    }
}

// 显示账户信息
function displayAccountInfo(accountData) {
    const balancesList = document.getElementById('balances-list');
    balancesList.innerHTML = '';
    
    if (accountData.balances && accountData.balances.length > 0) {
        accountData.balances.forEach(balance => {
            if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${balance.asset}</td>
                    <td>${balance.free}</td>
                    <td>${balance.locked}</td>
                    <td>${(parseFloat(balance.free) + parseFloat(balance.locked)).toFixed(8)}</td>
                `;
                balancesList.appendChild(row);
            }
        });
    } else {
        balancesList.innerHTML = '<tr><td colspan="4" class="text-center">暂无余额</td></tr>';
    }
}

// 更新网络选项
function updateNetworkOptions() {
    const coin = document.getElementById('coin').value;
    const networkSelect = document.getElementById('network');
    const batchNetworkSelect = document.getElementById('batch-network');
    const smartNetworkSelect = document.getElementById('smart-network');
    
    const networks = COIN_NETWORKS[coin] || [];
    
    [networkSelect, batchNetworkSelect, smartNetworkSelect].forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">选择网络</option>';
            networks.forEach(network => {
                const option = document.createElement('option');
                option.value = network;
                option.textContent = network;
                select.appendChild(option);
            });
        }
    });
}

// 切换提币模式
function toggleWithdrawalMode() {
    const mode = document.getElementById('withdrawal-mode').value;
    
    document.getElementById('single-withdrawal').style.display = mode === 'single' ? 'block' : 'none';
    document.getElementById('batch-withdrawal').style.display = mode === 'batch' ? 'block' : 'none';
    document.getElementById('smart-withdrawal').style.display = mode === 'smart' ? 'block' : 'none';
}

// 处理提币
function handleWithdrawal(event) {
    event.preventDefault();
    
    const mode = document.getElementById('withdrawal-mode').value;
    
    if (mode === 'single') {
        confirmSingleWithdrawal();
    } else if (mode === 'batch') {
        confirmBatchWithdrawal();
    } else if (mode === 'smart') {
        confirmSmartWithdrawal();
    }
}

// 确认单笔提币
function confirmSingleWithdrawal() {
    const coin = document.getElementById('coin').value;
    const network = document.getElementById('network').value;
    const address = document.getElementById('address').value;
    const amount = document.getElementById('amount').value;
    const addressTag = document.getElementById('address-tag').value;
    
    if (!coin || !network || !address || !amount) {
        showToast('请填写完整的提币信息', 'error');
        return;
    }
    
    const html = `
        <p><strong>币种:</strong> ${coin}</p>
        <p><strong>网络:</strong> ${network}</p>
        <p><strong>地址:</strong> ${address}</p>
        <p><strong>数量:</strong> ${amount}</p>
        ${addressTag ? `<p><strong>标签/备注:</strong> ${addressTag}</p>` : ''}
    `;
    
    document.getElementById('withdrawal-details').innerHTML = html;
    
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    modal.show();
}

// 执行提币
async function executeWithdrawal() {
    const mode = document.getElementById('withdrawal-mode').value;
    
    if (mode === 'single') {
        await executeSingleWithdrawal();
    } else if (mode === 'batch') {
        await executeBatchWithdrawal();
    } else if (mode === 'smart') {
        await executeSmartWithdrawal();
    }
}

// 执行单笔提币
async function executeSingleWithdrawal() {
    const coin = document.getElementById('coin').value;
    const network = document.getElementById('network').value;
    const address = document.getElementById('address').value;
    const amount = document.getElementById('amount').value;
    const addressTag = document.getElementById('address-tag').value;
    
    try {
        const response = await fetchWithSession('/api/withdraw', {
            method: 'POST',
            body: JSON.stringify({
                coin: coin,
                network: network,
                address: address,
                amount: amount,
                address_tag: addressTag
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            addLogEntry('success', `提币成功: ${coin} ${amount} -> ${address}`, new Date().toISOString());
            
            // 清空表单
            document.getElementById('address').value = '';
            document.getElementById('amount').value = '';
            document.getElementById('address-tag').value = '';
            
            // 刷新账户余额
            refreshAccount();
        } else {
            showToast(data.message, 'error');
            addLogEntry('error', `提币失败: ${data.message}`, new Date().toISOString());
        }
        
        // 关闭确认弹窗
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
        modal.hide();
        
    } catch (error) {
        console.error('提币失败:', error);
        showToast('提币失败: ' + error.message, 'error');
        addLogEntry('error', `提币异常: ${error.message}`, new Date().toISOString());
    }
}

// 执行批量提币
async function executeBatchWithdrawal() {
    const coin = document.getElementById('batch-coin').value;
    const network = document.getElementById('batch-network').value;
    const addressesText = document.getElementById('batch-addresses').value;
    
    // 解析地址列表
    const addresses = [];
    const lines = addressesText.trim().split('\n');
    
    for (const line of lines) {
        const parts = line.trim().split(/[\s,;]+/);
        if (parts.length >= 2) {
            addresses.push({
                address: parts[0],
                amount: parts[1],
                addressTag: parts[2] || ''
            });
        }
    }
    
    if (addresses.length === 0) {
        showToast('请输入有效的地址列表', 'error');
        return;
    }
    
    try {
        const response = await fetchWithSession('/api/batch-withdraw', {
            method: 'POST',
            body: JSON.stringify({
                coin: coin,
                network: network,
                addresses: addresses
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            
            // 显示结果
            if (data.results) {
                data.results.forEach(result => {
                    addLogEntry(
                        result.success ? 'success' : 'error',
                        `${result.address}: ${result.message}`,
                        new Date().toISOString()
                    );
                });
            }
            
            // 清空表单
            document.getElementById('batch-addresses').value = '';
            
            // 刷新账户余额
            refreshAccount();
        } else {
            showToast(data.message, 'error');
        }
        
        // 关闭确认弹窗
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
        modal.hide();
        
    } catch (error) {
        console.error('批量提币失败:', error);
        showToast('批量提币失败: ' + error.message, 'error');
    }
}

// 执行智能提币
async function executeSmartWithdrawal() {
    const coin = document.getElementById('smart-coin').value;
    const network = document.getElementById('smart-network').value;
    const addressesText = document.getElementById('smart-addresses').value;
    const amountMode = document.getElementById('amount-mode').value;
    
    // 解析地址列表
    const addresses = [];
    const lines = addressesText.trim().split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            const parts = trimmed.split(/[\s,;]+/);
            addresses.push({
                address: parts[0],
                tag: parts[1] || ''
            });
        }
    }
    
    if (addresses.length === 0) {
        showToast('请输入有效的地址列表', 'error');
        return;
    }
    
    // 构建数量配置
    let amountConfig = {};
    if (amountMode === 'fixed') {
        amountConfig = {
            mode: 'fixed',
            amount: parseFloat(document.getElementById('fixed-amount').value)
        };
    } else {
        amountConfig = {
            mode: 'random',
            min: parseFloat(document.getElementById('min-amount').value),
            max: parseFloat(document.getElementById('max-amount').value)
        };
    }
    
    try {
        const response = await fetchWithSession('/api/smart-withdraw', {
            method: 'POST',
            body: JSON.stringify({
                coin: coin,
                network: network,
                addresses: addresses,
                amount_config: amountConfig
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            
            // 显示结果
            if (data.results) {
                data.results.forEach(result => {
                    addLogEntry(
                        result.success ? 'success' : 'error',
                        `${result.address} (${result.amount} ${coin}): ${result.message}`,
                        new Date().toISOString()
                    );
                });
            }
            
            // 清空表单
            document.getElementById('smart-addresses').value = '';
            
            // 刷新账户余额
            refreshAccount();
        } else {
            showToast(data.message, 'error');
        }
        
        // 关闭确认弹窗
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
        modal.hide();
        
    } catch (error) {
        console.error('智能提币失败:', error);
        showToast('智能提币失败: ' + error.message, 'error');
    }
}

// 刷新IP信息
async function refreshIPInfo() {
    try {
        const response = await fetchWithSession('/api/ip-info');
        const data = await response.json();
        
        if (data.success && data.data) {
            document.getElementById('client-ip').textContent = data.data.client_ip || '未知';
            document.getElementById('server-region').textContent = data.data.server_region || '未知';
        }
    } catch (error) {
        console.error('获取IP信息失败:', error);
    }
}

// 添加日志条目
function addLogEntry(type, message, timestamp) {
    const logContainer = document.getElementById('log-container');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    
    const time = new Date(timestamp).toLocaleString('zh-CN');
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-message">${message}</span>`;
    
    logContainer.insertBefore(entry, logContainer.firstChild);
    
    // 限制日志数量
    while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// 显示提示信息
function showToast(message, type = 'info') {
    const toastHtml = `
        <div class="toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
    }
    
    const toastElement = document.createElement('div');
    toastElement.innerHTML = toastHtml;
    document.getElementById('toast-container').appendChild(toastElement);
    
    const toast = new bootstrap.Toast(toastElement.firstElementChild);
    toast.show();
    
    setTimeout(() => {
        toastElement.remove();
    }, 5000);
}