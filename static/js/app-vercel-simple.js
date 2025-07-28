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
    const apiForm = document.getElementById('api-config-form');
    if (apiForm) {
        apiForm.addEventListener('submit', handleApiConfig);
    }

    // 提币表单
    const withdrawalForm = document.getElementById('withdrawal-form');
    if (withdrawalForm) {
        withdrawalForm.addEventListener('submit', handleWithdrawal);
    }

    // 币种选择变化
    const coinSelect = document.getElementById('coin');
    if (coinSelect) {
        coinSelect.addEventListener('change', updateNetworkOptions);
    }

    // 提币模式切换
    const modeSelect = document.getElementById('withdrawal-mode');
    if (modeSelect) {
        modeSelect.addEventListener('change', toggleWithdrawalMode);
    }

    // 确认提币按钮
    const confirmBtn = document.getElementById('confirm-withdraw');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', executeWithdrawal);
    }
}

// 更新连接状态
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        if (connected) {
            statusElement.innerHTML = '<i class="fas fa-circle text-success"></i> 已连接';
        } else {
            statusElement.innerHTML = '<i class="fas fa-circle text-danger"></i> 未连接';
        }
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
        
        const apiKeyInput = document.getElementById('api-key');
        const testnetInput = document.getElementById('testnet');
        
        if (data.api_key && apiKeyInput) {
            apiKeyInput.value = data.api_key;
        }
        if (testnetInput) {
            testnetInput.checked = data.testnet;
        }
        
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
    if (!balancesList) return;
    
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
    
    if (!networkSelect) return;
    
    const networks = COIN_NETWORKS[coin] || [];
    
    networkSelect.innerHTML = '<option value="">选择网络</option>';
    networks.forEach(network => {
        const option = document.createElement('option');
        option.value = network;
        option.textContent = network;
        networkSelect.appendChild(option);
    });
}

// 切换提币模式
function toggleWithdrawalMode() {
    const mode = document.getElementById('withdrawal-mode').value;
    
    const fixedConfig = document.getElementById('fixed-amount-config');
    const randomConfig = document.getElementById('random-amount-config');
    
    if (fixedConfig && randomConfig) {
        fixedConfig.style.display = mode === 'fixed' ? 'block' : 'none';
        randomConfig.style.display = mode === 'random' ? 'block' : 'none';
    }
}

// 处理提币
function handleWithdrawal(event) {
    event.preventDefault();
    
    const coin = document.getElementById('coin').value;
    const network = document.getElementById('network').value;
    const addressList = document.getElementById('address-list').value;
    const mode = document.getElementById('withdrawal-mode').value;
    
    if (!coin || !network || !addressList.trim()) {
        showToast('请填写完整的提币信息', 'error');
        return;
    }
    
    // 解析地址列表
    const addresses = [];
    const lines = addressList.trim().split('\n');
    
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
    
    // 构建确认信息
    let html = `
        <p><strong>币种:</strong> ${coin}</p>
        <p><strong>网络:</strong> ${network}</p>
        <p><strong>地址数量:</strong> ${addresses.length}</p>
        <p><strong>提币模式:</strong> ${mode === 'fixed' ? '固定数量' : '随机数量'}</p>
    `;
    
    if (mode === 'fixed') {
        const amount = document.getElementById('fixed-amount').value;
        html += `<p><strong>固定数量:</strong> ${amount}</p>`;
    } else {
        const minAmount = document.getElementById('min-amount').value;
        const maxAmount = document.getElementById('max-amount').value;
        html += `<p><strong>随机区间:</strong> ${minAmount} - ${maxAmount}</p>`;
    }
    
    document.getElementById('withdrawal-details').innerHTML = html;
    
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    modal.show();
}

// 执行提币
async function executeWithdrawal() {
    const coin = document.getElementById('coin').value;
    const network = document.getElementById('network').value;
    const addressesText = document.getElementById('address-list').value;
    const amountMode = document.getElementById('withdrawal-mode').value;
    
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
            document.getElementById('address-list').value = '';
            
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
            const clientIp = document.getElementById('client-ip');
            const serverRegion = document.getElementById('server-region');
            
            if (clientIp) clientIp.textContent = data.data.client_ip || '未知';
            if (serverRegion) serverRegion.textContent = data.data.server_region || '未知';
        }
    } catch (error) {
        console.error('获取IP信息失败:', error);
    }
}

// 添加日志条目
function addLogEntry(type, message, timestamp) {
    const logContainer = document.getElementById('real-time-logs');
    if (!logContainer) return;
    
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
    
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
        toastContainer = container;
    }
    
    const toastElement = document.createElement('div');
    toastElement.innerHTML = toastHtml;
    toastContainer.appendChild(toastElement);
    
    const toast = new bootstrap.Toast(toastElement.firstElementChild);
    toast.show();
    
    setTimeout(() => {
        toastElement.remove();
    }, 5000);
}

// 清空日志
function clearLogs() {
    const logContainer = document.getElementById('real-time-logs');
    if (logContainer) {
        logContainer.innerHTML = '<div class="text-muted">等待日志...</div>';
    }
}

// 刷新提币历史
function refreshWithdrawalHistory() {
    // Vercel版本不支持历史记录
    showToast('Vercel版本不支持历史记录功能', 'info');
}

// 验证地址列表
function validateAddressList() {
    const addressesText = document.getElementById('address-list').value;
    const lines = addressesText.trim().split('\n');
    let validCount = 0;
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            validCount++;
        }
    }
    
    const resultElement = document.getElementById('address-validation-result');
    if (resultElement) {
        if (validCount > 0) {
            resultElement.innerHTML = `<span class="text-success">✓ ${validCount} 个有效地址</span>`;
        } else {
            resultElement.innerHTML = '<span class="text-danger">✗ 未找到有效地址</span>';
        }
    }
}