// =======================================================
// ARQUIVO: script.js
// LÓGICA DE SEGURANÇA E REGISTRO DE PRESENÇA (GOOGLE SHEETS)
// =======================================================

// 🚨 IMPORTANTE: Verifique se este URL é o CORRETO (Planilha Principal com status do aluno)
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/d2cbxsw23rkjz'; 

// Chaves de localStorage para o Timer de Acesso (24h)
const ACCESS_KEY = 'vimeo_access_granted';
const EXPIRATION_KEY = 'access_expires_at';
const CPF_KEY = 'vimeo_user_cpf';
const TOKEN_KEY = 'vimeo_user_token';
// NOVO: Chave para armazenar o nome do aluno
const NAME_KEY = 'vimeo_user_name';
const DURATION_HOURS = 24;

// Chave de localStorage para a Presença Diária
const PRESENCE_DATE_KEY = 'lastPresenceDate';

// Variáveis para armazenar o ID dos intervalos dos contadores
let countdownPresenceInterval = null;
let countdownTokenInterval = null;

// =======================================================
// 1. FUNÇÕES DE UTILIDADE E AUXILIARES
// =======================================================

/**
 * Formata o CPF (00000000000 -> 000.000.000-00) para manter consistência com o Sheets.
 */
function formatCPF(cpf) {
    cpf = cpf.replace(/[^\d]/g, '').substring(0, 11);
    if (cpf.length > 9) {
        return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cpf;
}

/**
 * Retorna a data atual no formato YYYY-MM-DD para uso como chave de comparação de presença.
 */
function getCurrentDateKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Retorna a data e hora atuais formatadas (ex: 2025-11-27 13:05:48)
 * para uso no registro de log (timestamp).
 */
function getCurrentTimestamp() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Calcula o tempo em milissegundos restante até a meia-noite (00:00:00) do dia seguinte.
 */
function calcularTempoParaMeiaNoite() {
    const agora = new Date();
    const proximaMeiaNoite = new Date(agora);

    // Define o tempo para 00:00:00.000 do dia seguinte
    proximaMeiaNoite.setDate(agora.getDate() + 1);
    proximaMeiaNoite.setHours(0, 0, 0, 0);

    const tempoRestante = proximaMeiaNoite.getTime() - agora.getTime();

    return Math.max(0, tempoRestante);
}

/**
 * Formata o tempo restante em horas, minutos e segundos.
 */
function formatarTempoRestante(milissegundos) {
    const totalSegundos = Math.floor(milissegundos / 1000);
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;

    const pad = (num) => String(num).padStart(2, '0');

    return `${pad(horas)}h ${pad(minutos)}m ${pad(segundos)}s`;
}

// =======================================================
// 2. LÓGICA DE LOGIN (Para index.html)
// =======================================================

/**
 * Função de Login: Busca o Token e o CPF na planilha, ativa ou renova o timer de 24h.
 */
async function checkToken() {
    const tokenInput = document.getElementById('tokenInput').value.trim().toUpperCase();
    const cpfInput = formatCPF(document.getElementById('cpfInput').value.trim());

    const messageElement = document.getElementById('message');
    const loginButton = document.getElementById('loginButton');

    messageElement.textContent = '';
    messageElement.style.color = 'red';

    if (cpfInput.length !== 14 || !tokenInput) {
        messageElement.textContent = 'Por favor, preencha o Token e o CPF corretamente.';
        return;
    }

    loginButton.disabled = true;
    messageElement.textContent = 'Verificando acesso...';
    messageElement.style.color = 'gray';

    try {
        // 1. Busca na planilha pelo Token e CPF
        const searchUrl = `${SHEETDB_API_URL}/search?token=${tokenInput}&cpf=${cpfInput}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (!data || data.length === 0 || data.length > 1) {
            messageElement.textContent = 'Erro: Token ou CPF inválido. Aluno não encontrado na base.';
            return;
        }

        const alunoData = data[0];
        // NOVO: Captura o nome do aluno da coluna 'nome_aluno' (ajuste se sua coluna tiver outro nome)
        const alunoNome = alunoData.nome_aluno || 'Aluno Não Nomeado'; 
        
        const agora = Date.now();
        const expiracaoSalva = parseInt(alunoData.expiracao_ms) || 0;

        let novaExpiracao;
        let statusMensagem;

        // 2. Lógica do Timer (24h)
        if (agora < expiracaoSalva) {
            statusMensagem = 'Acesso já ativo. Redirecionando...';
            novaExpiracao = expiracaoSalva;
        } else {
            novaExpiracao = agora + (DURATION_HOURS * 60 * 60 * 1000);

            // 3. Atualiza a Planilha com a nova data de expiração
            const updateUrl = `${SHEETDB_API_URL}/token/${tokenInput}`;

            await fetch(updateUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: { expiracao_ms: novaExpiracao }
                })
            });

            statusMensagem = `Acesso renovado por ${DURATION_HOURS} horas! Redirecionando...`;
        }

        // 4. Salva o acesso no localStorage (Chaves de sessão)
        localStorage.setItem(ACCESS_KEY, 'true');
        localStorage.setItem(EXPIRATION_KEY, novaExpiracao);
        localStorage.setItem(CPF_KEY, cpfInput);
        localStorage.setItem(TOKEN_KEY, tokenInput);
        // NOVO: Salva o nome no localStorage
        localStorage.setItem(NAME_KEY, alunoNome);

        messageElement.textContent = statusMensagem;
        messageElement.style.color = 'green';

        setTimeout(() => {
            window.location.href = 'videos.html';
        }, 500);

    } catch (error) {
        console.error("Erro de comunicação com o SheetDB:", error);
        messageElement.textContent = 'Erro de comunicação ou no servidor. Tente novamente mais tarde.';
    } finally {
        loginButton.disabled = false;
    }
}

// =======================================================
// 3. SEGURANÇA E ACESSO (Para videos.html)
// =======================================================

/**
 * Verifica se o usuário tem acesso válido (timer de 24h).
 */
function checkAccess() {
    const hasAccess = localStorage.getItem(ACCESS_KEY) === 'true';
    const expirationTime = localStorage.getItem(EXPIRATION_KEY);

    // Se não tiver acesso ou não tiver tempo de expiração salvo
    if (!hasAccess || !expirationTime) {
        window.location.href = 'index.html?expired=no_access';
        return false;
    }

    // Verifica se o tempo expirou
    if (Date.now() > parseInt(expirationTime)) {
        logout(); // Limpa a sessão
        window.location.href = 'index.html?expired=true';
        return false;
    }

    // Se o acesso for válido, exibe a primeira aula e inicia os contadores
    if(document.getElementById('aula1')) {
        showLesson('aula1');
        verificarStatusPresenca();
        iniciarContadorExpiracao(); 
    }

    return true;
}

/**
 * Encerra a sessão do usuário e redireciona para a página de login.
 */
function logout() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(EXPIRATION_KEY);
    localStorage.removeItem(CPF_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY); // Remove o nome

    // Limpa os contadores ativos
    if (countdownPresenceInterval !== null) {
        clearInterval(countdownPresenceInterval);
        countdownPresenceInterval = null;
    }
    if (countdownTokenInterval !== null) {
        clearInterval(countdownTokenInterval);
        countdownTokenInterval = null;
    }

    window.location.href = 'index.html';
}

// =======================================================
// 4. CONTADOR DE EXPIRAÇÃO DE TOKEN (24h)
// =======================================================

/**
 * Inicia um contador regressivo para exibir o tempo restante de acesso (24h).
 */
function iniciarContadorExpiracao() {
    // Limpa qualquer contador anterior para evitar sobreposição
    if (countdownTokenInterval !== null) {
        clearInterval(countdownTokenInterval);
        countdownTokenInterval = null;
    }

    const expirationTimeMs = parseInt(localStorage.getItem(EXPIRATION_KEY));
    const displayElement = document.getElementById('tokenExpirationDisplay');

    if (!displayElement) return;

    // Se não houver tempo de expiração ou já tiver expirado
    if (!expirationTimeMs || (expirationTimeMs - Date.now()) <= 0) {
        displayElement.textContent = '❌ Sessão expirada. Faça login novamente.';
        displayElement.style.color = 'red';
        return;
    }

    // Função para atualizar o contador a cada segundo
    const atualizarContador = () => {
        const agora = Date.now();
        const tempoRestante = expirationTimeMs - agora;

        if (tempoRestante <= 0) {
            clearInterval(countdownTokenInterval);
            countdownTokenInterval = null;
            displayElement.textContent = '❌ Seu acesso expirou!';
            checkAccess();
            return;
        }

        displayElement.style.color = '#0077B5'; // Azul
        displayElement.textContent = `⏳ Seu acesso expira em: ${formatarTempoRestante(tempoRestante)}`;
    };

    atualizarContador();
    countdownTokenInterval = setInterval(atualizarContador, 1000);
}


// =======================================================
// 5. REGISTRO DE PRESENÇA (Para videos.html)
// =======================================================

/**
 * Verifica o estado da presença diária (Lida do localStorage) e configura o contador até a meia-noite.
 */
function verificarStatusPresenca() {
    if (countdownPresenceInterval !== null) {
        clearInterval(countdownPresenceInterval);
        countdownPresenceInterval = null;
    }

    const todayKey = getCurrentDateKey();
    const lastPresenceDate = localStorage.getItem(PRESENCE_DATE_KEY);
    const presencaButton = document.getElementById('presencaButton');
    const presencaMessage = document.getElementById('presencaMessage');

    if (lastPresenceDate === todayKey) {
        presencaButton.disabled = true;
        presencaButton.textContent = 'Presença de Hoje Já Registrada ✅';

        const atualizarContador = () => {
            const tempoRestante = calcularTempoParaMeiaNoite();

            if (tempoRestante <= 0) {
                clearInterval(countdownPresenceInterval);
                countdownPresenceInterval = null;
                verificarStatusPresenca();
                return;
            }

            const tempoFormatado = formatarTempoRestante(tempoRestante);
            presencaMessage.style.color = '#901090'; // Roxo
        };

        atualizarContador();
        countdownPresenceInterval = setInterval(atualizarContador, 1000);

    } else {
        presencaButton.disabled = false;
        presencaButton.textContent = 'Marcar Presença de Hoje';
        presencaMessage.style.color = '#000000';
        presencaMessage.textContent = 'Clique para registrar sua presença e frequência no curso.';
    }
}


/**
 * Registra a presença do usuário na planilha via SheetDB, realizando PATCH (Status) e POST (Histórico).
 */
async function marcarPresenca() {
    const presencaButton = document.getElementById('presencaButton');
    const presencaMessage = document.getElementById('presencaMessage');

    presencaButton.disabled = true;
    presencaButton.textContent = 'Registrando...';
    presencaMessage.textContent = 'Aguarde, enviando dados para o servidor...';
    presencaMessage.style.color = '#0077B5';

    const token = localStorage.getItem(TOKEN_KEY);
    const cpf = localStorage.getItem(CPF_KEY);
    // NOVO: Captura o nome do aluno
    const nome = localStorage.getItem(NAME_KEY); 

    const todayKey = getCurrentDateKey();
    
    const lastPresenceDate = localStorage.getItem(PRESENCE_DATE_KEY);
    if (lastPresenceDate === todayKey) {
        verificarStatusPresenca();
        return;
    }

    // Adiciona verificação do nome
    if (!token || !cpf || !nome) { 
        presencaMessage.textContent = 'Erro: Falha de autenticação. Tente fazer login novamente.';
        presencaMessage.style.color = '#dc3545';
        presencaButton.disabled = false;
        presencaButton.textContent = 'Marcar Presença de Hoje';
        return;
    }

    try {
        // 1. Busca o aluno para obter os dados atuais (Passo opcional, mas mantido)
        const searchUrl = `${SHEETDB_API_URL}/search?token=${token}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (!data || data.length === 0) {
            throw new Error("Aluno não encontrado na base de dados (SheetDB)");
        }

        const currentTimestamp = getCurrentTimestamp();

        // =============================================================
        // PASSO 2: ATUALIZA A PLANILHA PRINCIPAL (PATCH)
        // Isso é NECESSÁRIO para o bloqueio de UMA presença por dia.
        // =============================================================
        const dataToUpdate = {
            'data': {
                'ultima_presenca': todayKey,
                'hora_registro': currentTimestamp, 
                // NOVO: Adiciona o nome na Planilha Principal (para correção/atualização)
                'nome_aluno': nome 
            }
        };

        const updateUrl = `${SHEETDB_API_URL}/token/${token}`;

        const updateResponse = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToUpdate)
        });

        const result = await updateResponse.json();

        if (updateResponse.ok) {
            
            // =============================================================
            // PASSO 3: INSERE UM NOVO LOG NA PLANILHA DE HISTÓRICO (POST)
            // Isso CRIA uma nova linha para o registro de presença, preservando o histórico.
            // =============================================================
            const dataToLog = {
                'data': {
                    'token': token,
                    'cpf': cpf,
                    // NOVO: Adiciona o nome no Log Histórico
                    'nome_aluno': nome, 
                    'data_registro': todayKey, 
                    'hora_registro': currentTimestamp 
                }
            };
            
            const logResponse = await fetch(PRESENCE_LOG_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dataToLog)
            });

            if (!logResponse.ok) {
                console.warn('Alerta: Falha ao registrar log de presença na planilha de LOG histórico.');
            }

            // Sucesso! Atualiza o localStorage para evitar múltiplos registros no mesmo dia
            localStorage.setItem(PRESENCE_DATE_KEY, todayKey);
            
            // 4. Finalização do Processo (MANTIDO)
            verificarStatusPresenca();
            
            presencaMessage.style.color = '#901090';
            presencaMessage.textContent = `✅ Presença registrada com sucesso! ${currentTimestamp}`;
            
        } else {
            throw new Error(`Erro ao registrar presença: ${result.message || updateResponse.statusText}`);
        }
    } catch (error) {
        console.error('Erro no registro de presença:', error);

        presencaMessage.textContent = `Falha ao registrar. Verifique sua conexão. Erro: ${error.message}.`;
        presencaMessage.style.color = '#dc3545';
        presencaButton.disabled = false;
        presencaButton.textContent = 'Tentar Registrar Presença Novamente';
    }
}

// =======================================================
// 6. FUNÇÕES DE NAVEGAÇÃO
// =======================================================

function showLesson(lessonId) {
    const allLessons = document.querySelectorAll('.aula-container');
    allLessons.forEach(lesson => lesson.style.display = 'none');

    const allButtons = document.querySelectorAll('.nav-buttons button');
    allButtons.forEach(button => button.classList.remove('active'));

    const currentLesson = document.getElementById(lessonId);
    if (currentLesson) {
        currentLesson.style.display = 'block';
    }

    const currentButton = document.getElementById(`btn-${lessonId}`);
    if (currentButton) {
        currentButton.classList.add('active');
    }
}

// =======================================================
// 7. INICIALIZAÇÃO DA PÁGINA
// =======================================================

/**
 * Função principal que inicializa o estado da página ao carregar.
 */
function initializePage() {
    const cpfInput = document.getElementById('cpfInput');
    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            e.target.value = formatCPF(e.target.value);
        });
    }

    if (window.location.pathname.endsWith('videos.html') || window.location.pathname.endsWith('videos.html/')) {
        checkAccess();
    }
}

// Chama a função de inicialização assim que o DOM estiver carregado
window.onload = initializePage;


