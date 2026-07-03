# Status do Projeto — TCC Fernando Futila (UFSC Araranguá)

> **Data de referência:** 29 de junho de 2026  
> **Orientação:** TCC **defendido e aprovado com nota 10**. Ajustes pós-defesa incorporados conforme recomendações da 1ª e 2ª avaliadoras (título, citações, novos diagramas, reestruturação do Cap 1, correções visuais). PDF final: 55 páginas, zero erros.

---

## 1. Visão Geral do Sistema

Sistema de controle de acesso inteligente para imóveis de aluguel por temporada (ex: Airbnb).  
Arquitetura **Servidor Interceptador**: nenhuma interface fala diretamente com o hardware.

```
[COM internet]   App → Django REST API → MQTT (HiveMQ Cloud) → ESP32 → relé
[SEM internet]   App → BLE direto → ESP32 → relé
```

**Monorepo com 4 camadas:**

| Camada | Tecnologia | Diretório |
|---|---|---|
| Backend | Django 5 + DRF + paho-mqtt | `backend/` |
| Dashboard Web | React 19 + TypeScript + Shadcn UI | `dashboard/` |
| App do Hóspede | React Native + Expo SDK 54 | `hospede-app/` |
| Firmware | ESP32 + C++ (Arduino) | `firmware/` |
| Monografia | LaTeX (abntex2) | `TCC_Fernando/` |

---

## 2. Estado Atual de Cada Camada

### ✅ Backend Django — Completo e funcional

- API REST completa com todos os endpoints implementados
- Autenticação por token (registro, login, perfil, troca de senha)
- Modelos: `Fechadura`, `AcessoTemporario`, `HistoricoEvento`
- Ciclo de vida completo do acesso temporário (5 estados: `PENDENTE` → `AGENDADO` → `ATIVO` → `EXPIRADO` / `REVOGADO`)
- Integração MQTT com HiveMQ Cloud — TLS porta 8883 + autenticação por usuário/senha
- Função auxiliar `_mqtt_publish()` em `views.py` centraliza toda configuração MQTT
- Configuração via variáveis de ambiente (`MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD`) em `settings.py`
- `python manage.py mqtt_subscriber` — daemon que assina `v1/locks/+/status` e `v1/locks/+/sensors`
- `signals.py` — signal `post_save` em `AcessoTemporario` que publica `SET_BLE_TOKEN` / `CLEAR_BLE_TOKEN` via MQTT
- Endpoint `POST /api/acessos/{id}/sincronizar_ble/` — reenvio manual do token BLE
- Validação temporal na abertura pelo hóspede
- Registro de telemetria com precisão de 4 casas decimais (`DecimalField`)
- Dados de demonstração via `python manage.py seed_data`

---

### ✅ Dashboard Web (React) — Completo e funcional

- Todas as telas implementadas: `/login`, `/register`, `/dashboard`, `/fechaduras/:id`, `/reservas`, `/logs`, `/perfil`
- Tema escuro, responsivo, Shadcn UI
- Interceptador Axios para injeção automática do token de autenticação

---

### ✅ App do Hóspede (React Native / Expo) — Completo + BLE + EAS Build

- Fluxo internet: inserção do token → validação no servidor → abertura via REST API
- Token persistido com `expo-secure-store`, revalidado na abertura do app
- Detecção de internet via `expo-network` — exibe automaticamente o modo BLE quando offline
- `src/lib/ble.ts` — lib utilitária BLE (scan, connect, authenticate, sendCommand, disconnect)
  - Solicita permissões Android em runtime (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`)
  - Aguarda estado `PoweredOn` do BLE antes de iniciar scan
- `src/screens/BluetoothScreen.tsx` — tela com fluxo scan → connect → auth → OPEN/LED
- `AcessoScreen` atualizado — botão "Abrir via Bluetooth" disponível dentro do período da reserva
- `app.json` com config plugin `@config-plugins/react-native-ble-plx` e permissões iOS/Android
- **EAS Build configurado e testado:**
  - `eas.json` com 3 perfis: `development` (APK + dev client, hot reload), `preview` (APK standalone), `production` (AAB)
  - `owner: "fernandofutila"`, `android.package: "com.fernandofutila.hospedeapp"`, EAS project ID configurado
  - `.npmrc` com `legacy-peer-deps=true` para compatibilidade com o servidor EAS
  - APK de preview gerado: build `37cd7e93`
  - **APK de development (hot reload) gerado e funcionando:** build `b2b5faa9`
  - `BASE_URL = 'http://192.168.0.8:8000/api'` configurado corretamente

---

### ✅ Firmware (ESP32) — **Completo, gravado e testado com hardware real**

> ⚠️ **Sessão 27/05/2026:** Firmware corrigido para testes com relé físico amanhã.  
> Credenciais Wi-Fi (linhas 51-53 do `main.ino`) precisam ser atualizadas para a rede do local dos testes antes de regravar.

**MAC do dispositivo:** `30:AE:A4:03:47:BC`  
**Registrado em:** `Fechadura.id_dispositivo` no Django admin  
**Advertising BLE:** `SmartLock-0347BC`

| Funcionalidade | Status |
|---|---|
| Firmware: `MODO_TESTE_BLE`                  | ✅ Corrigido para `false` |
| Firmware: `PIN_RELAY = 26` (relé real)      | ✅ Corrigido (era 27 — LED de teste) |
| Firmware: `PIN_DHT = 27` (DHT22 real)       | ✅ Corrigido (era 25 — não conectado) |
| Conexão Wi-Fi | ✅ Testado |
| Cliente MQTT — assina `v1/locks/30:AE:A4:03:47:BC/commands` | ✅ Testado |
| Heartbeat `"ONLINE"` a cada 30 s + LWT `"OFFLINE"` | ✅ Testado |
| Broker HiveMQ Cloud com TLS porta 8883 + autenticação | ✅ Testado |
| Leitura do sensor MQ-5 (gás, saída digital DO) — GPIO 34 | ✅ Implementado |
| Leitura do sensor DHT22 (temperatura/umidade) — GPIO 27 | ✅ Implementado |
| Telemetria JSON com 4 casas decimais | ✅ Implementado |
| Executa `"OPEN"` → aciona relé (GPIO 26) | ✅ Implementado |
| Emergência autônoma por detecção de gás | ✅ Implementado |
| **BLE GATT Server** — advertising `SmartLock-{MAC6}` | ✅ Testado |
| **AUTH char** — valida token contra NVS; sessão de 5 min | ✅ Testado |
| **COMMAND char** — `"OPEN"`, `"LED_ON"`, `"LED_OFF"` (exige auth) | ✅ Testado |
| **STATUS char** — notifica `"AUTHORIZED"`, `"DENIED"`, `"OPENED"` | ✅ Testado |
| **NVS (Preferences)** — persiste token BLE entre reinicializações | ✅ Testado |
| **Comandos MQTT** `SET_BLE_TOKEN` / `CLEAR_BLE_TOKEN` | ✅ Implementado |
| **Modo BLE fallback** — ativa após 5 falhas MQTT | ✅ Testado |
| **`#define MODO_TESTE_BLE`** — desconecta Wi-Fi após 2 min (apenas testes) | ✅ Testado |

**Decisão de arquitetura crítica:** BLE e MQTT-TLS são mutuamente exclusivos no ESP32.  
Com BLE ativo sobram ~49 KB de heap — insuficiente para o handshake TLS (~60–70 KB).  
MQTT é o modo primário; BLE ativa apenas após 5 falhas consecutivas de conexão MQTT.

**Bibliotecas (Arduino IDE):** PubSubClient, DHT sensor library, Adafruit Unified Sensor, ArduinoJson.  
BLE e NVS (Preferences) fornecidos pelo ESP32 Arduino Core — sem instalação extra.  
**Partition Scheme:** Huge APP (3MB No OTA/1MB SPIFFS) — obrigatório (firmware ocupa ~1.77 MB).

---

### ✅ Monografia (LaTeX) — **6 capítulos, 55 páginas, zero erros** (29/06/2026 — pós-defesa)

- **Reestruturação completa:** 5 → 6 capítulos após revisão do orientador
- Cap 1 — Introdução
- Cap 2 — Fundamentação Teórica (5 trabalhos relacionados + síntese crítica)
- Cap 3 — Metodologia
- Cap 4 — Desenvolvimento do Sistema *(condensado — de 17 para ~14 páginas)*
- Cap 5 — Testes e Avaliação *(novo)*
- Cap 6 — Conclusão *(sem seção Contribuições; Limitações movidas ao Cap 5)*
- **Sensor corrigido:** MQ-2 → **MQ-5** (saída digital DO, não analógica ADC) em todo o documento
- **7 imagens reais inseridas** (antes eram placeholders):
  - `HiveMQ.png` → Sec. 4.4.4
  - `tela-fechaduras.png`, `tela-reservas.png`, `tela-log-eventos.png` → Sec. 4.5.2
  - `app-token-screen.jpeg`, `app-acesso-screen.jpeg` → Sec. 4.6.2
  - `prototipo-porta-esp32-fechadura.jpeg` → Sec. 4.7.1
- **Diagrama de sequência** movido do Cap 6 → Sec. 4.4.4 (Integração MQTT)
- Glossário: ADC, CA, LWT, LED, GATT, NVS, LTK todos definidos em `main.tex`

### ✅ Apresentação de Defesa — **Gerada em 27/05/2026**

Duas versões completas com **20 slides / 20 minutos**:

| Arquivo | Formato | Observação |
|---|---|---|
| `TCC_Fernando/apresentacao.pdf` | LaTeX Beamer (cores UFSC) | Compilado, pronto |
| `TCC_Fernando/apresentacao_defesa.pptx` | Template do professor (UFSC Araranguá) | Pronto |

**Estrutura dos 20 slides:**
1. Capa · 2. Agenda · 3. Contextualização · 4. Objetivos · 5. Stack · 6. Arquitetura · 7. Modelo de Dados · 8. Firmware · 9. Backend · 10. Dashboard · 11. App Hóspede · 12. BLE Offline · 13. Sequência · 14. Protótipo · 15. Resultados · 16. Limitações · 17. Contribuições · 18. Trabalhos Futuros · 19. Conclusões · 20. Obrigado

> **Pendente:** Inserir fotos do protótipo (slide 14) e screenshots do dashboard/app (slides 10, 11) após os testes de amanhã.

---

## 3. O que foi feito nesta sessão (18 mai 2026)

1. **EAS Build configurado do zero:**
   - Criados `eas.json`, `.npmrc`, `.easignore`
   - Corrigidas versões de dependências (`expo-network`, `expo-secure-store`, `react-native-screens`)
   - APK preview (build `37cd7e93`) e APK development com hot reload (build `b2b5faa9`) gerados com sucesso

2. **Firmware gravado no hardware real:**
   - Corrigido erro de compilação C++ (forward declaration de `abrirFechadura`)
   - Resolvido problema de sketch muito grande (partition scheme Huge APP)
   - Resolvido falha MQTT-TLS (heap insuficiente com BLE ativo) — arquitetura BLE/MQTT mutuamente exclusivos
   - Resolvido crash loop ONLINE/OFFLINE (BLE não é reativado após MQTT conectar)
   - MQTT conectando ao HiveMQ Cloud com sucesso

3. **BLE offline testado com hardware real:**
   - Corrigidas permissões Android runtime no app
   - App conecta via BLE, autentica e abre a porta ✅
   - Modo de teste `MODO_TESTE_BLE` implementado: desconecta Wi-Fi após 2 min para testar fallback BLE

---

## 3.1 O que foi feito nesta sessão (27 mai 2026)

1. **Firmware corrigido para testes com relé físico (amanhã, com orientador):**
   - `MODO_TESTE_BLE` alterado de `true` → `false` (evita desconexão Wi-Fi forçada em 2 min)
   - `PIN_RELAY` corrigido de `27` → `26` (pino do relé real, era LED de simulação)
   - `PIN_DHT` corrigido de `25` → `27` (pino do DHT22 real, era GPIO sem conexão)
   - ⚠️ Credenciais Wi-Fi (linhas 51-53) precisam ser atualizadas para a rede do local

2. **Apresentação de defesa gerada em duas versões:**
   - `TCC_Fernando/apresentacao.tex` + `apresentacao.pdf` — LaTeX Beamer, 20 slides, cores UFSC
   - `TCC_Fernando/apresentacao_defesa.pptx` — Template oficial do professor (UFSC Araranguá), 20 slides
   - Ambas com estrutura completa: arquitetura, diagramas, firmware, resultados, contribuições, trabalhos futuros
   - Slides 10, 11, 14 têm placeholders para screenshots e fotos do protótipo (inserir após os testes)

---

## 3.2 O que foi feito nesta sessão (30 mai 2026)

1. **Capítulo 2 — Trabalhos Relacionados expandido:**
   - Seção anterior tinha apenas 3 artigos em parágrafos rasos (~10 linhas)
   - 5 subsecções detalhadas: Abdulkareem, Pinjala/Gupta, Khan, Rodrigues, Basso
   - Subsecção de Síntese Crítica com itemize e parágrafo de posicionamento do trabalho

---

## 3.4 O que foi feito nesta sessão (29 jun 2026) — Ajustes pós-defesa

### Resultado da defesa
- **TCC aprovado com nota 10 (máxima)** em 26/06/2026
- Banca fez recomendações de melhoria; todas da 1ª e 2ª avaliadoras foram incorporadas nesta sessão

### Recomendações da 1ª avaliadora — aplicadas

1. **Título** alterado → *"Uma proposta de Controle de Acesso Inteligente para Imóveis de Aluguel"* (`main.tex`)
2. **Custos não apareciam no documento:** adicionado `Quadro~\ref{qua:bom}` (BOM com 7 componentes, total R$\,174) em `3-chapter.tex`, justificando o argumento de "baixo custo"
3. **OE "projetar e construir protótipo" sem processo descrito:** adicionada subseção *Projeto e Montagem do Protótipo de Hardware* em `3-chapter.tex` (pinout, isolação galvânica, protoboard, validação incremental)
4. **Critério de seleção dos trabalhos relacionados não explicado:** adicionado parágrafo de metodologia de busca no início da seção (IEEE Xplore, ACM, Google Scholar; 2019–2024) em `2-chapter.tex`
5. **Servidor Interceptador sem seção própria:** adicionada `\section{PADRÃO ARQUITETURAL: SERVIDOR INTERCEPTADOR}` (3 parágrafos) em `2-chapter.tex`, antes de Trabalhos Relacionados
6. **Figura para metodologia:** adicionada figura TikZ `fig:fluxo-metodologia` (4 etapas + seta de refinamento iterativo) em `3-chapter.tex`
7. **Citação ESP32 com ano errado e truncada:** corrigido `year = {2026}` → `{2023}` e adicionado `author = {{Espressif Systems}}` no `.bib`; sentença reestruturada para usar `\cite` (sem `\textcite`)
8. **DER — seta Fechadura→HistoricoEvento sobrepondo tabela:** roteada pelo lado esquerdo (`fh.west -- ++(-0.8,0) -| hh.west`); label "N" movido para `pos=0.87, right`

### Correções adicionais (mesma sessão)

9. **Página em branco** após Lista de Abreviaturas e Siglas removida: `\imprimirlistadesimbolos` comentado em `beforetext.tex` (glossário de símbolos vazio gerava página)
10. **Fluxo metodológico:** espaçamento dos nós aumentado (3,4 → 3,7) para setas mais visíveis

### Recomendações da 2ª avaliadora — aplicadas

11. **Diagrama de arquitetura — sensores colados:** sensores redistribuídos de posições (1.2/3.2/5.2) para (0.4/3.2/6.0); textos divididos em duas linhas; gap entre nós de 0,1 → 0,9 cm
12. **Diagrama de estados AcessoTemporario — labels sobre setas:** setas horizontais trocadas por `bend left=18` com `above=3pt`, afastando rótulos das linhas
13. **UUID BLE cortado no texto:** UUID movido para linha própria centralizada (`\begin{center}\ttfamily\small\end{center}`); tabela `tab:ble-chars` recebeu `\centering`
14. **Cap. 1 — apresentação fragmentada:** reestruturado como prosa fluida; removidos cabeçalhos `CONTEXTUALIZAÇÃO E PROBLEMA`, `JUSTIFICATIVA`, `DELIMITAÇÃO DO ESCOPO` e `METODOLOGIA`; conteúdo fundido em parágrafos contínuos; mantidas apenas seções `OBJETIVOS` e `ORGANIZAÇÃO DO TRABALHO`
15. **Cap. 1 — sem figura que materialize o problema:** adicionada `fig:problema-solucao` (diagrama TikZ dois painéis: *Cenário atual* vs. *Solução proposta*, com fluxos MQTT e BLE)
    - Hóspede (App Mobile) posicionado abaixo do ESP32 para evitar colisão com linha divisória
    - Seta BLE: `hosp2.east to[bend right=40] esp.east` — arco pelo lado direito dos nós

**PDF final:** 55 páginas, zero erros de compilação.

---

## 3.3 O que foi feito nesta sessão (15 jun 2026)

### Monografia — Revisão do orientador incorporada

1. **Ponto 5 (orientador):** "token de resgate" sem definição na pág 40
   - Adicionada definição inline na Sec. 4.2.1 com `\ref{}` para a entidade `AcessoTemporario`

2. **Ponto 6 (orientador):** Sensor MQ-2 descrito como analógico; questão sobre relé
   - Sensor corrigido de MQ-2 → **MQ-5** em todo o documento (diagrama TikZ, hardware list, telemetria, emergência)
   - Descrição alterada para saída digital (DO) + comparador onboard — removidas equações ADC

3. **Reestruturação 5 → 6 capítulos:**
   - **Cap 5 (novo):** TESTES E AVALIAÇÃO — rotas REST, integração MQTT, fluxo app, BLE (só Android), latência broker público vs. privado, limitações
   - **Cap 6 (novo):** CONCLUSÃO — fusão do intro do antigo cap 5 + Considerações Finais; sem seção "Contribuições"; Limitações movidas ao Cap 5
   - Cap 1 atualizado com os novos títulos dos capítulos 5 e 6

4. **Cap 4 condensado** (de 17 para ~14 páginas, de 21 para 14 subseções):
   - Dashboard: 7 subseções de tela-por-tela → 1 "Funcionalidades Principais"
   - App móvel: 2 subseções de tela → 1 "Telas de Resgate e Acesso"

5. **7 imagens reais inseridas** (substituíram placeholders):
   - `HiveMQ.png` + diagrama de sequência → Sec. 4.4.4
   - `tela-fechaduras.png`, `tela-reservas.png`, `tela-log-eventos.png` → Sec. 4.5.2
   - `app-token-screen.jpeg`, `app-acesso-screen.jpeg` → Sec. 4.6.2
   - `prototipo-porta-esp32-fechadura.jpeg` → Sec. 4.7.1
   - Diagrama de sequência removido do Cap 6

### Backend — Bug corrigido

6. **Erro "Erro ao criar fechadura":** `FechaduraViewSet` sem `perform_create`
   - `perform_create` → injeta `proprietario=request.user` automaticamente
   - `get_queryset` → utilizador só vê as suas próprias fechaduras (fix de segurança)
   - `read_only_fields` no serializer → `proprietario`, `id_unico`, `esta_online`, `ultima_comunicacao`
   - `basename='fechadura'` no router (obrigatório sem `queryset` de classe)
   - Frontend: `catch` agora exibe o erro real da API

### Outros

7. **Senhas resetadas:** `futila` (admin) → `admin@1234` | `fernando.futila@gmail.com` → `fernando@1234`
8. **Expo networking:** resolvido ligando telemóvel e computador à mesma rede Wi-Fi

---

- [x] ~~Desativar `#define MODO_TESTE_BLE false` no firmware antes da entrega~~ ✅ 27/05/2026
- [x] ~~Tirar fotos do protótipo~~ ✅ 15/06/2026 (prototipo-porta-esp32-fechadura.jpeg inserida)
- [x] ~~Inserir screenshots do Dashboard e App~~ ✅ 15/06/2026
- [x] ~~Revisar monografia com orientador~~ ✅ 15/06/2026 (pontos 5 e 6 do orientador resolvidos)
- [x] ~~Revisão geral do documento completo~~ ✅ 16/06/2026
- [x] ~~Atualizar slides da apresentação com nova estrutura de 6 capítulos~~ ✅ 16/06/2026
- [x] ~~**Defesa:** Junho 2026~~ ✅ **26/06/2026 — Aprovado com nota 10**
- [x] ~~Ajustes pós-defesa (1ª avaliadora)~~ ✅ 29/06/2026
- [x] ~~Ajustes pós-defesa (2ª avaliadora)~~ ✅ 29/06/2026
- [ ] Criar `.gitignore` para proteger credenciais HiveMQ antes de push público
- [ ] Ajustes pós-defesa (3ª avaliadora — pendente)

---

## 5. Limitações que permanecem

| Limitação | Situação |
|---|---|
| Testes end-to-end com hardware e relé real | ✅ Realizados e documentados no Cap 5 |
| Banco SQLite3 (não apto para produção) | Permanece — declarada na monografia |
| Ausência de testes automatizados | Permanece — declarada na monografia |
| Status online/offline sem WebSocket | Permanece — declarada na monografia |
| `WiFiClientSecure.setInsecure()` | Permanece — aceitável para protótipo |
| BLE sem pareamento de SO (Bonding) | Permanece — citado como trabalho futuro |
| Dependência de internet para MQTT | ✅ Mitigada pelo BLE offline |

---

## 6. Arquivos Relevantes

| Arquivo | O que contém |
|---|---|
| `firmware/main/main.ino` | Firmware completo: MQTT + BLE GATT + sensores + NVS + modo teste |
| `backend/access_control/signals.py` | Signals Django: sincronização automática do token BLE |
| `backend/access_control/views.py` | API REST + endpoint `sincronizar_ble` |
| `backend/access_control/management/commands/mqtt_subscriber.py` | Daemon MQTT subscriber |
| `hospede-app/src/lib/ble.ts` | Lib BLE: scan, connect, permissions, authenticate, sendCommand |
| `hospede-app/src/screens/BluetoothScreen.tsx` | Tela BLE do hóspede |
| `hospede-app/src/screens/AcessoScreen.tsx` | Tela de acesso (internet + BLE) |
| `hospede-app/eas.json` | Configuração EAS Build (dev/preview/production) |
| `hospede-app/app.json` | Config plugin BLE + permissões iOS/Android + EAS project ID |
| `hospede-app/.npmrc` | `legacy-peer-deps=true` — necessário para EAS Build server |
| `TCC_Fernando/chapters/4-chapter.tex` | Cap. 4: firmware + BLE + app + backend |
| `TCC_Fernando/chapters/5-chapter.tex` | Cap. 5: resultados, limitações, trabalhos futuros |
| `TCC_Fernando/apresentacao.tex` | Apresentação LaTeX Beamer — 20 slides, cores UFSC |
| `TCC_Fernando/apresentacao.pdf` | PDF compilado da apresentação Beamer |
| `TCC_Fernando/apresentacao_defesa.pptx` | Apresentação no template oficial do professor (UFSC Araranguá) |

---

## 7. Trabalhos Futuros (documentados no TCC)

1. **BLE Bonding com LTK** — pareamento nativo do SO com chaves de longo prazo
2. Broker MQTT privado com TLS e certificados X.509
3. Notificações em tempo real via WebSocket (Django Channels)
4. Integração com iCal (Airbnb / Booking.com)
5. Reconhecimento facial como segundo fator
6. Testes automatizados e pipeline CI/CD
7. App mobile do anfitrião (React Native)
