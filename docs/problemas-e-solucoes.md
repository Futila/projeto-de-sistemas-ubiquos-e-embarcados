# Problemas Encontrados e Soluções

> Registro dos principais problemas reais enfrentados durante o desenvolvimento do firmware, backend e app mobile, com a causa raiz e a solução aplicada. Extraído e reorganizado a partir do histórico de sessões em [`status-projeto.md`](status-projeto.md). O README principal traz um resumo em tabela linkando para esta página.

---

## Firmware (ESP32)

### 1. Erro de compilação: função usada antes de ser declarada

- **Problema:** o Arduino IDE recusava compilar o sketch com erro de "não declarado neste escopo" ao chamar `abrirFechadura()` a partir do callback MQTT, definido antes da função no arquivo.
- **Causa:** o C++ exige que uma função seja declarada (ou definida) antes do primeiro uso; o callback MQTT (`mqttCallback`) estava definido acima da definição de `abrirFechadura()`.
- **Solução:** adicionada uma _forward declaration_ de `abrirFechadura()` no topo do arquivo, antes de qualquer função que a utilize.

### 2. "Sketch too large" ao gravar no ESP32

- **Problema:** o Arduino IDE recusava gravar o firmware com erro de que o sketch excedia o espaço disponível na flash.
- **Causa:** o firmware combina Wi-Fi com TLS, cliente MQTT, servidor BLE GATT e ArduinoJson — juntos ocupam cerca de 1,77 MB, mais que o esquema de partição padrão (~1,2 MB) do ESP32.
- **Solução:** alterar **Tools → Partition Scheme → "Huge APP (3MB No OTA/1MB SPIFFS)"** no Arduino IDE antes de compilar. Documentado em `firmware/README.md`.

### 3. Handshake MQTT-TLS falhando com o BLE ativo

- **Problema:** com o servidor BLE GATT ativo, a conexão MQTT via TLS (porta 8883) falhava de forma intermitente ou não completava o handshake.
- **Causa:** o BLE ativo consome heap do ESP32, deixando cerca de 49 KB livres — insuficiente para o handshake TLS, que exige tipicamente 60–70 KB.
- **Solução (decisão de arquitetura):** BLE e MQTT-TLS passaram a ser **mutuamente exclusivos**. MQTT é o modo primário; o firmware só ativa o servidor BLE depois de 5 falhas consecutivas de conexão MQTT, liberando heap suficiente para o TLS quando a rede está disponível.

### 4. Loop de reconexão ONLINE/OFFLINE (crash loop)

- **Problema:** após o MQTT reconectar com sucesso, o dispositivo entrava em um ciclo de queda e reconexão constante.
- **Causa:** o BLE não estava sendo desativado corretamente ao restaurar a conexão MQTT, disputando o heap e derrubando o cliente MQTT logo em seguida.
- **Solução:** ajuste no fluxo de estado do firmware para desligar o BLE de forma explícita assim que o MQTT reconecta, antes de retomar o heartbeat normal.

### 5. Pinos de teste trocados com os pinos reais

- **Problema:** durante os testes de bancada, o relé/acoplador óptico e o DHT22 estavam mapeados para pinos usados apenas em simulação com LED (GPIO 27 e GPIO 25), não para o hardware físico definitivo.
- **Causa:** o firmware nasceu com um modo de simulação (LED no lugar do relé) para desenvolver sem o hardware final em mãos, e as constantes não foram atualizadas antes dos primeiros testes com o relé real.
- **Solução:** `PIN_RELAY` e `PIN_DHT` corrigidos para os pinos do hardware físico definitivo (atualmente GPIO 23 para o acoplador óptico e GPIO 27 para o DHT22, conforme `firmware/main/main.ino` e a monografia, Cap. 3 e 4).

### 6. Divergência entre a documentação (MQ-5 digital) e o firmware (leitura analógica)

- **Problema:** a monografia descreve o sensor de gás como MQ-5 com comparador onboard e saída digital (DO), mas o firmware (`firmware/main/main.ino`) lê o pino com `analogRead()` e compara contra `GAS_THRESHOLD` — um comportamento analógico.
- **Causa:** o módulo MQ-5 usado expõe tanto a saída digital (DO) quanto a analógica (AO); o firmware foi implementado usando a saída AO (herdada do desenho inicial com o MQ-2, que só tem saída analógica), e a descrição da monografia foi atualizada para o MQ-5 sem que o código fosse revisado para usar a saída digital.
- **Situação atual:** o firmware funciona corretamente lendo o AO — a divergência é apenas entre a descrição do sensor no texto e a implementação, não um defeito funcional. Registrado aqui para transparência; ver `firmware/README.md` para a nota completa. Ajustar o código para ler a saída digital (`digitalRead`) fica como melhoria futura, caso se quicira alinhar 100% com o texto da monografia.

---

## Backend (Django)

### 7. "Erro ao criar fechadura" ao usar o endpoint da API

- **Problema:** requisições `POST /api/fechaduras/` retornavam erro genérico e não associavam a fechadura criada a nenhum proprietário.
- **Causa:** `FechaduraViewSet` não implementava `perform_create`, então o campo `proprietario` (obrigatório no modelo) nunca era preenchido automaticamente a partir do usuário autenticado.
- **Solução:**
  - `perform_create` implementado para injetar `proprietario=request.user` automaticamente.
  - `get_queryset` ajustado para que cada usuário só veja suas próprias fechaduras — **isso também corrigiu uma falha de segurança**, já que antes qualquer usuário autenticado podia ver fechaduras de outros proprietários.
  - `read_only_fields` adicionado ao serializer para `proprietario`, `id_unico`, `esta_online` e `ultima_comunicacao`.
  - `basename='fechadura'` adicionado ao router (obrigatório quando o ViewSet não expõe um `queryset` de classe).

---

## App Mobile (React Native / Expo / EAS Build)

### 8. Dependências incompatíveis ao gerar o build via EAS

- **Problema:** o build no servidor da EAS falhava por conflitos de versão entre pacotes (`expo-network`, `expo-secure-store`, `react-native-screens`).
- **Causa:** versões dessas dependências fora do intervalo esperado pelo SDK do Expo em uso, e o servidor de build da EAS não resolve automaticamente conflitos de _peer dependencies_ como o `npm` local costuma fazer.
- **Solução:** versões das dependências ajustadas para as compatíveis com o SDK do Expo, e `.npmrc` com `legacy-peer-deps=true` adicionado ao projeto para instruir o servidor de build a não travar em conflitos de peer dependency.

### 9. App não conseguia falar com o backend em rede local

- **Problema:** o app no celular físico não conseguia alcançar `http://localhost:8000` nem outros endereços testados.
- **Causa:** `localhost` no celular aponta para o próprio celular, não para o computador rodando o Django; além disso, celular e computador precisam estar na mesma rede Wi-Fi para se enxergarem.
- **Solução:** `BASE_URL` configurado com o IP local da máquina rodando o Django (ex.: `http://192.168.0.8:8000/api`) em `hospede-app/src/lib/api.ts`, com celular e computador conectados à mesma rede Wi-Fi.

---

## Resumo

| #   | Camada        | Problema                                       | Solução                                            |
| --- | ------------- | ---------------------------------------------- | -------------------------------------------------- |
| 1   | Firmware      | Erro de compilação (função não declarada)      | Forward declaration                                |
| 2   | Firmware      | Sketch grande demais                           | Partition Scheme "Huge APP"                        |
| 3   | Firmware      | TLS falha com BLE ativo                        | BLE e MQTT mutuamente exclusivos                   |
| 4   | Firmware      | Loop ONLINE/OFFLINE                            | Desativar BLE ao reconectar MQTT                   |
| 5   | Firmware      | Pinos de simulação vs. reais                   | Constantes de pino corrigidas                      |
| 6   | Firmware/Docs | MQ-5 digital (texto) vs. analógico (código)    | Documentado; alinhamento fica como melhoria futura |
| 7   | Backend       | "Erro ao criar fechadura" + falha de segurança | `perform_create` + `get_queryset` por proprietário |
| 8   | App Mobile    | EAS Build falhando por dependências            | Versões ajustadas + `legacy-peer-deps`             |
| 9   | App Mobile    | App não alcançava o backend                    | `BASE_URL` com IP local + mesma rede Wi-Fi         |
