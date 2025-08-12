$(document).ready(function () {
    // --- CONFIGURAÇÃO PRINCIPAL ---
    // !!! COLE AQUI A URL DO SEU GOOGLE APPS SCRIPT PUBLICADO !!!
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwxh-c0PuOCYqpo2xZtrcgq-Tkglwgg0TAdvBhTxpyHocHYDCqY-KTYRw66h7aXWqu1hQ/exec";

    let quadroDeColaboradores = [];
    let dadosDasSubmissoes = [];
    let meusGraficos = {}; // Objeto para guardar as instâncias dos gráficos

    // --- FUNÇÃO AUXILIAR PARA CORRIGIR DATAS ---
    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        const data = new Date(dataString);
        if (isNaN(data.getTime())) { return 'Data Inválida'; }
        const dia = String(data.getUTCDate()).padStart(2, '0');
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const ano = data.getUTCFullYear();
        return `${dia}/${mes}/${ano}`;
    }

    // --- FUNÇÃO PARA DESTRUIR GRÁFICOS ---
    function destruirGrafico(nomeGrafico) {
        if (meusGraficos[nomeGrafico]) meusGraficos[nomeGrafico].destroy();
    }

    // --- INICIALIZAÇÃO DO DASHBOARD ---
    async function iniciarDashboard() {
        const pontoDeInjecao = $('#td0id_do_seu_campo_aqui');
        if (pontoDeInjecao.length === 0) return;

        pontoDeInjecao.html(criarEstruturaHTML());
        $('#dashboard-app').hide();
        pontoDeInjecao.append('<h3 id="loading-message" style="font-family: Segoe UI, sans-serif; color: #e2e8f0;">Carregando dashboard de aderência, por favor aguarde...</h3>');

        try {
            const response = await fetch(`${SCRIPT_URL}?action=getDashboardData`);
            const data = await response.json();
            if (!data.success) throw new Error(`Erro no script do Google: ${data.message}`);
            
            quadroDeColaboradores = data.collaborators;
            dadosDasSubmissoes = data.submissions;

            $('#loading-message').hide();
            $('#dashboard-app').show();
            
            popularFiltrosIniciais();
            processarEExibirDados('Todos', 'Todos');
            configurarFiltros();

        } catch (error) {
            $('#loading-message').html(`<div style="color: #f56565; background: #4a5568; border: 1px solid #f56565; padding: 15px; border-radius: 8px;"><strong>Falha ao carregar o dashboard.</strong><br><p>Erro: ${error.message}</p></div>`);
        }
    }

    // --- POPULAR FILTROS ---
    function popularFiltrosIniciais() {
        const filtroColaborador = $('#filtro-colaborador');
        filtroColaborador.html('<option value="Todos">Todos</option>');
        quadroDeColaboradores.forEach(nome => filtroColaborador.append(`<option value="${nome}">${nome}</option>`));

        const mesesUnicos = [...new Set(dadosDasSubmissoes.map(r => r.Data_Hora_Submissao ? new Date(r.Data_Hora_Submissao).toISOString().substring(0, 7) : ''))].filter(Boolean).sort().reverse();
        const filtroMesAno = $('#filtro-mes-ano');
        filtroMesAno.html('<option value="Todos">Todos</option>');
        mesesUnicos.forEach(mesAno => {
            const [ano, mes] = mesAno.split('-');
            filtroMesAno.append(`<option value="${mesAno}">${mes}/${ano}</option>`);
        });
    }

    // --- CONFIGURAR FILTROS ---
    function configurarFiltros() {
        $('#filtro-colaborador, #filtro-mes-ano').on('change', function() {
            processarEExibirDados($('#filtro-colaborador').val(), $('#filtro-mes-ano').val());
        });
    }

    // --- LÓGICA PRINCIPAL ---
    function processarEExibirDados(filtroColaborador, filtroMesAno) {
        let submissoesFiltradas = dadosDasSubmissoes;

        if (filtroColaborador !== 'Todos') {
            submissoesFiltradas = submissoesFiltradas.filter(s => s.Colaborador === filtroColaborador);
        }
        if (filtroMesAno !== 'Todos') {
            submissoesFiltradas = submissoesFiltradas.filter(s => s.Data_Hora_Submissao && new Date(s.Data_Hora_Submissao).toISOString().startsWith(filtroMesAno));
        }

        const submissoesAgrupadas = [...new Set(submissoesFiltradas.map(s => s.Submission_ID))].map(id => {
            const p = submissoesFiltradas.find(s => s.Submission_ID === id);
            
            // ====================================================================
            // INÍCIO DA CORREÇÃO: Converte o valor da aderência para porcentagem
            // ====================================================================
            let aderenciaVal = parseFloat(String(p.Aderencia_Final).replace('%', '').replace(',', '.')) || 0;
            // Se o valor for um decimal (ex: 0.85), multiplica por 100.
            if (aderenciaVal > 0 && aderenciaVal <= 1) {
                aderenciaVal *= 100;
            }
            // ====================================================================
            // FIM DA CORREÇÃO
            // ====================================================================

            return { 
                id, 
                colaborador: p.Colaborador, 
                aderencia: aderenciaVal // Usa o valor corrigido
            };
        });
        
        // --- ATUALIZAÇÃO DOS KPIs ---
        const totalColaboradores = (filtroColaborador !== 'Todos') ? 1 : quadroDeColaboradores.length;
        const totalSubmissoes = submissoesAgrupadas.length;
        const somaAderencias = submissoesAgrupadas.reduce((sum, s) => sum + s.aderencia, 0);
        const aderenciaMedia = totalSubmissoes > 0 ? (somaAderencias / totalSubmissoes) : 0; // Deixa como float para formatação posterior
        
        const contagemNok = submissoesFiltradas.filter(s => s.Resposta === 'NOK').reduce((acc, s) => {
            if(s.Pergunta) acc[s.Pergunta] = (acc[s.Pergunta] || 0) + 1;
            return acc;
        }, {});
        const principalDesafio = Object.keys(contagemNok).length > 0 ? Object.entries(contagemNok).sort((a,b)=>b[1]-a[1])[0][0] : 'N/A';
        const analisesPendentes = submissoesFiltradas.filter(s => s.Status_Analise === 'Pendente').length;

        // Formata os valores para exibição com .toFixed(0) apenas no final
        $('#total-colaboradores').html(`${totalColaboradores} <span class="bi-mini">👥</span>`);
        $('#total-submissoes').html(`${totalSubmissoes} <span class="bi-mini">📝</span>`);
        $('#aderencia-media').html(`${aderenciaMedia.toFixed(0)}% <span class="bi-mini">🎯</span>`);
        $('#principal-desafio').text(principalDesafio).attr('title', principalDesafio);

        // --- ATUALIZAÇÃO DOS TOP 5 ---
        const topPerguntasNok = calcularTop(submissoesFiltradas.filter(s=>s.Resposta==='NOK'), 'Pergunta', 5);
        preencherTabelaTop5('#tabela-top-perguntas-nok', topPerguntasNok);
        
        const justificativasRecusadas = submissoesFiltradas.filter(s => s.Status_Analise === 'Recusada').map(s => ({ item: s.Justificativa, contagem: 1 }));
        preencherTabelaTop5('#tabela-top-justificativas-recusadas', justificativasRecusadas.slice(0, 5));

        const topNA = calcularTop(submissoesFiltradas.filter(s=>s.Resposta==='N/A'), 'Pergunta', 5);
        preencherTabelaTop5('#tabela-top-perguntas-na', topNA);
        
        renderizarMetasEVisaoDetalhada(submissoesFiltradas, filtroColaborador, filtroMesAno);
        renderizarGraficosPrincipais(submissoesFiltradas, filtroColaborador, filtroMesAno);
    }

    function calcularTop(dados, coluna, limite) {
        if (!dados || dados.length === 0) return [];
        const contagem = dados.reduce((acc, item) => {
            const valor = item[coluna];
            if (valor) acc[valor] = (acc[valor] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(contagem).sort(([, a], [, b]) => b - a).slice(0, limite).map(([item, contagem]) => ({ item, contagem }));
    }

    function preencherTabelaTop5(idTabela, dados) {
        const tbody = $(`${idTabela} tbody`);
        tbody.empty();
        if (dados.length === 0) {
            tbody.html('<tr><td colspan="2" style="text-align:center; font-style:italic;">Sem dados.</td></tr>');
            return;
        }
        dados.forEach(d => tbody.append(`<tr><td>${d.item}</td><td style="text-align:center;">${d.contagem}</td></tr>`));
    }

    function renderizarMetasEVisaoDetalhada(submissoes, filtroColaborador, filtroMesAno) {
        const containerVisaoDetalhada = $('#visao-detalhada-container');
        const containersPadrao = $('.graficos-container, .top-ocorrencias-container, .tables-bis');
        
        if (filtroColaborador === 'Todos' || filtroMesAno === 'Todos') {
            containerVisaoDetalhada.hide();
            containersPadrao.show();
            preencherTabelasPadrao(submissoes);
            return;
        }
        
        containerVisaoDetalhada.show();
        containersPadrao.hide();
        
        const metaAderencia = 95;
        const submissoesDoColaborador = [...new Set(submissoes.map(s => s.Submission_ID))].map(id => {
            const p = submissoes.find(s => s.Submission_ID === id);
            let aderenciaVal = parseFloat(String(p.Aderencia_Final).replace('%','').replace(',','.')) || 0;
            if(aderenciaVal > 0 && aderenciaVal <= 1) aderenciaVal *= 100;
            return { id, data: p.Data_Hora_Submissao, aderencia: aderenciaVal };
        });

        const somaAderencias = submissoesDoColaborador.reduce((sum, s) => sum + s.aderencia, 0);
        const aderenciaMedia = submissoesDoColaborador.length > 0 ? somaAderencias / submissoesDoColaborador.length : 0;
        
        const porcentagemTotal = Math.min((aderenciaMedia / metaAderencia) * 100, 100);

        const cardProgressoHtml = `<div class="table-bi"><h5>Acompanhamento Mensal: ${filtroColaborador}</h5><div class="meta-item"><div class="meta-label"><span>Aderência Média vs Meta</span><span>${aderenciaMedia.toFixed(0)}% / ${metaAderencia}%</span></div><div class="meta-progress-bar"><div class="meta-progress" style="width: ${porcentagemTotal}%;"></div></div></div></div>`;
        $('#meta-progresso-container').html(cardProgressoHtml);

        let listaDetalhesHtml = '';
        submissoesDoColaborador.forEach(s => {
            const icone = s.aderencia >= metaAderencia ? '✔️' : '❌';
            listaDetalhesHtml += `<li class="detalhe-item"><span>${icone} ${formatarData(s.data)}</span><span>${s.aderencia.toFixed(0)}%</span></li>`;
        });
        $('#lista-contribuicao-individual').html(listaDetalhesHtml);

        const rankingPerguntasNOK = calcularTop(submissoes.filter(s => s.Resposta === 'NOK'), 'Pergunta', 10);
        let rankingHtml = '';
        rankingPerguntasNOK.forEach((r, i) => {
            rankingHtml += `<tr><td><b>${i + 1}</b></td><td>${r.item}</td><td>${r.contagem}</td></tr>`;
        });
        $('#tabela-ranking-detalhada').html(rankingHtml);
    }
    
    function preencherTabelasPadrao(submissoes) {
        let ultimasSubmissoes = [...new Set(submissoes.map(s=>s.Submission_ID))].map(id => {
            const p = submissoes.find(s=>s.Submission_ID === id);
            let aderenciaVal = parseFloat(String(p.Aderencia_Final).replace('%','').replace(',','.')) || 0;
            if(aderenciaVal > 0 && aderenciaVal <= 1) aderenciaVal *= 100;
            return { data: p.Data_Hora_Submissao, colaborador: p.Colaborador, aderencia: aderenciaVal };
        }).sort((a,b) => new Date(b.data) - new Date(a.data));

        const linhasTabelaDetalhe = ultimasSubmissoes.slice(0, 10).map(r => `<tr><td>${formatarData(r.data)}</td><td>${r.colaborador || ''}</td><td>${r.aderencia.toFixed(0)}%</td></tr>`).join('');
        $('#tabela-detalhe-relatos-padrão tbody').html(linhasTabelaDetalhe);

        const rankingData = quadroDeColaboradores.map(colaborador => {
            const subs = dadosDasSubmissoes.filter(s => s.Colaborador === colaborador);
            const idsUnicos = [...new Set(subs.map(s => s.Submission_ID))];
            if (idsUnicos.length === 0) return { nome: colaborador, media: 0};
            const soma = idsUnicos.reduce((acc, id) => {
                let aderenciaVal = parseFloat(String(subs.find(s=>s.Submission_ID===id).Aderencia_Final).replace('%','').replace(',','.'))||0;
                if(aderenciaVal > 0 && aderenciaVal <= 1) aderenciaVal *= 100;
                return acc + aderenciaVal;
            },0);
            return { nome: colaborador, media: soma / idsUnicos.length };
        }).sort((a,b) => b.media - a.media);

        const linhasTabelaRanking = rankingData.slice(0, 5).map((r, i) => `<tr><td><b>${i + 1}</b></td><td>${r.nome}</td><td>${r.media.toFixed(0)}%</td></tr>`).join('');
        $('#tabela-ranking-padrão tbody').html(linhasTabelaRanking);
    }

    function renderizarGraficosPrincipais(submissoesFiltradas, filtroColaborador, filtroMesAno) {
        const meses = [...new Set(dadosDasSubmissoes.map(r => r.Data_Hora_Submissao ? new Date(r.Data_Hora_Submissao).toISOString().substring(0, 7) : ''))].filter(Boolean).sort();
        const dadosEvolucao = meses.map(mes => {
            const subsDoMes = dadosDasSubmissoes.filter(s => new Date(s.Data_Hora_Submissao).toISOString().startsWith(mes) && (filtroColaborador==='Todos' || s.Colaborador===filtroColaborador));
            const ids = [...new Set(subsDoMes.map(s=>s.Submission_ID))];
            if(ids.length === 0) return { mes, valor: 0};
            const soma = ids.reduce((acc, id) => {
                let aderenciaVal = parseFloat(String(subsDoMes.find(s=>s.Submission_ID===id).Aderencia_Final).replace('%','').replace(',','.'))||0;
                if(aderenciaVal > 0 && aderenciaVal <= 1) aderenciaVal *= 100;
                return acc + aderenciaVal;
            },0);
            return { mes, valor: soma / ids.length };
        });
        renderizarGraficoLinha(dadosEvolucao);

        const dadosColunas = quadroDeColaboradores.map(c => {
            const subs = submissoesFiltradas.filter(s => s.Colaborador === c);
            const ids = [...new Set(subs.map(s=>s.Submission_ID))];
            if(ids.length === 0) return {label: c, valor: 0};
            const soma = ids.reduce((acc, id) => {
                let aderenciaVal = parseFloat(String(subs.find(s=>s.Submission_ID===id).Aderencia_Final).replace('%','').replace(',','.'))||0;
                if(aderenciaVal > 0 && aderenciaVal <= 1) aderenciaVal *= 100;
                return acc + aderenciaVal;
            },0);
            return { label: c, valor: soma / ids.length };
        }).filter(d => d.valor > 0);
        renderizarGraficoColunas(dadosColunas);

        const dadosPizza = submissoesFiltradas.reduce((acc, s) => {
            const status = s.Status_Analise || 'N/A';
            if(status) acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        renderizarGraficoPizza(dadosPizza);
    }
    
    function renderizarGraficoLinha(dados) {
        destruirGrafico('graficoLinha');
        meusGraficos['graficoLinha'] = new Chart(document.getElementById('grafico-evolucao-linha').getContext('2d'), {
            type: 'line', data: {
                labels: dados.map(d => { const [a,m] = d.mes.split('-'); return `${m}/${a.slice(2)}`}),
                datasets: [{ label: 'Aderência Média', data: dados.map(d => d.valor.toFixed(0)), borderColor: '#81e6d9', backgroundColor: 'rgba(129, 230, 217, 0.1)', fill: true, tension: 0.4 }]
            }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Evolução da Aderência Média', font: { size: 16 }, color: '#e2e8f0' } },
            scales: { x: { ticks: { color: '#a0aec0' } }, y: { beginAtZero: true, max: 100, ticks: { color: '#a0aec0' }, grid: { color: '#4a5568' } } } }
        });
    }

    function renderizarGraficoColunas(dados) {
        destruirGrafico('graficoColunas');
        meusGraficos['graficoColunas'] = new Chart(document.getElementById('grafico-aderencia-colunas').getContext('2d'), {
            type: 'bar', data: { labels: dados.map(d => d.label), datasets: [{ label: 'Aderência Média', data: dados.map(d => d.valor.toFixed(0)), backgroundColor: '#63b3ed' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Aderência por Colaborador', font: { size: 16 }, color: '#e2e8f0' } },
            scales: { x: { ticks: { color: '#a0aec0' } }, y: { beginAtZero: true, max: 100, ticks: { color: '#a0aec0' }, grid: { color: '#4a5568' } } } }
        });
    }

    function renderizarGraficoPizza(dados) {
        destruirGrafico('graficoPizza');
        meusGraficos['graficoPizza'] = new Chart(document.getElementById('grafico-tipo-relato').getContext('2d'), {
            type: 'doughnut', data: { labels: Object.keys(dados), datasets: [{ data: Object.values(dados), backgroundColor: ["#f6ad55", "#68d391", "#fc8181", "#63b3ed", "#b794f4", "#4fd1c5"] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#a0aec0' } }, title: { display: true, text: 'Distribuição por Status de Análise', font: { size: 16 }, color: '#e2e8f0' } } }
        });
    }
    
    function criarEstruturaHTML() { 
        return `
        <div id="dashboard-app" class="dashboard-container">
            <div class="dashboard-header"><h2>Dashboard de Aderência da Agenda</h2></div>
            <div class="filtros-container">
                <div class="filtro-item"><label for="filtro-colaborador">Colaborador:</label><select id="filtro-colaborador"><option value="Todos">Todos</option></select></div>
                <div class="filtro-item"><label for="filtro-mes-ano">Mês/Ano:</label><select id="filtro-mes-ano"><option value="Todos">Todos</option></select></div>
            </div>
            <div class="cards-resumo">
                <div class="card"><h4>Total Colaboradores</h4><div id="total-colaboradores" class="valor">0</div></div>
                <div class="card"><h4>Total Submissões</h4><div id="total-submissoes" class="valor">0</div></div>
                <div class="card"><h4>Aderência Média</h4><div id="aderencia-media" class="valor">0%</div></div>
                <div class="card"><h4>Principal Desafio (NOK)</h4><div id="principal-desafio" class="valor" style="font-size: 16px; min-height: 38px; display: flex; align-items: center;">N/A</div></div>
            </div>
            
            <div id="visao-detalhada-container" style="display: none;">
                <div id="meta-progresso-container"></div>
                <div id="detalhes-colaboradores-container">
                    <div class="detalhe-card"><h6>Aderência por Submissão</h6><div class="detalhe-list-wrapper"><ul id="lista-contribuicao-individual" class="detalhe-list"></ul></div></div>
                    <div class="detalhe-card"><h6>Ranking de Perguntas "NÃO"</h6><div class="detalhe-list-wrapper"><table width="100%"><thead><tr><th style="width:10%;">#</th><th>Pergunta</th><th style="width:20%;">Qtd</th></tr></thead><tbody id="tabela-ranking-detalhada"></tbody></table></div></div>
                </div>
            </div>

            <div class="graficos-container">
                <div class="grafico"><canvas id="grafico-evolucao-linha"></canvas></div>
                <div class="grafico"><canvas id="grafico-aderencia-colunas"></canvas></div>
                <div class="grafico"><canvas id="grafico-tipo-relato"></canvas></div>
            </div>
            
            <div class="top-ocorrencias-container">
                <div class="top-ocorrencias-grid">
                    <div class="table-bi"><h4>Top 5 - Perguntas com 'NÃO'</h4><table id="tabela-top-perguntas-nok" width="100%"><thead><tr><th>Pergunta</th><th style="width:20%;">Qtd</th></tr></thead><tbody></tbody></table></div>
                    <div class="table-bi"><h4>Últimas Justificativas Recusadas</h4><table id="tabela-top-justificativas-recusadas" width="100%"><thead><tr><th>Justificativa</th><th style="width:20%;"></th></tr></thead><tbody></tbody></table></div>
                    <div class="table-bi"><h4>Top 5 - Perguntas com 'N/A'</h4><table id="tabela-top-perguntas-na" width="100%"><thead><tr><th>Pergunta</th><th style="width:20%;">Qtd</th></tr></thead><tbody></tbody></table></div>
                </div>
            </div>

            <div class="tables-bis">
                <div class="table-bi"><h4>Detalhe das Últimas Submissões</h4><table id="tabela-detalhe-relatos-padrão" width="100%"><thead><tr><th>Data</th><th>Colaborador</th><th>Aderência</th></tr></thead><tbody></tbody></table></div>
                <div class="table-bi"><h4>Ranking de Aderência</h4><table id="tabela-ranking-padrão" width="100%"><thead><tr><th>#</th><th>Nome</th><th>Aderência</th></tr></thead><tbody></tbody></table></div>
            </div>
        </div>
    `;}

    iniciarDashboard();

});
