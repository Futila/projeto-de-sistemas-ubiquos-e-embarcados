# Introdução:

Um protocolo famoso para a Internet das Coisas é o MQTT. O MQTT funciona de forma simular ao REDIS (quando usado na arquitetura de publish subscribe). Tal como no REDIS é necessário conectar num servidor MQTT. Na nomenclatura do MQTT esse é chamado de broker. Assim podemos instalar numa máquina local o broker (um dos mais populares é chamado de  **mosquitto**).  

Para realizar testes, podemos usar um broker público (**broker.emqx.io**), isto é, uma máquina remota que roda um broker e permite que usuário se conectem e escrevam em filas de mensagens. Outros clientes podem ler dessas filas. Note que como é público e não existe mecanismo de autenticação de usuários, qualquer pessoa pode ler as filas de mensagens se souberem ou adivinharem o seu nome.

# Como usar:

O Mqtt pode utilizar d
O broker geralmente roda na porta 1883 e nessa porta a comunicação usa sockets TCP. Essa é a porta mais popular pois é mais comum usar o MQTT usando TCP.  Mas existem outras portas como mostra a lista abaixo:

```
Porta TCP:1883
Porta WebSocket:8083
Porta WebSocket segura:8084
```

# Instalação:

## Usando o NodeJS

Se o objetivo é utilizar o nodejs, podemos utilizar:

```
npm i mqtt
```

## Exemplo  no NodeJS - app1.js

```
// APP1
var mqtt = require("mqtt");
var client = mqtt.connect("mqtt://broker.emqx.io");
var valorLED = 0;
var valorVERMELHO = 0;

client.on("connect", function () {
  console.log("Conectou no servidor local Mosquitto");
});

client.subscribe("temperatura");
client.subscribe("alerta");
client.subscribe("outTopic");

client.on("message", function (topic, message) {
  // message is Buffer
  console.log("recebeu msg do topico:" + topic);
  console.log(message.toString());
});
var temp = 30.05;

setInterval(function () {
  client.publish("temperatura", "FABIO");
  temp += 0.5;
}, 3000);

setInterval(function () {
  if (valorLED == 1) client.publish("ledVERDE", "1");
  else client.publish("ledVERDE", "0");
  valorLED = !valorLED;
}, 5000);

setInterval(function () {
  if (valorVERMELHO == 1) client.publish("ledVERMELHO", "1");
  else client.publish("ledVERMELHO", "0");
  valorVERMELHO = !valorVERMELHO;
}, 2000);
```

Esse exemplo faz um subscribe em 3 filas de mensagens (*temperatura*, *ledVERMELHO* e *ledVERDE*) e ele também cria tarefas periódicas que enviam mensagens para essas filas. Assim, ao rodar a aplicação vemos as mensagens sendo enviadas para um site externo e sendo recebidas desse mesmo site.

## Exemplo  no NodeJS - app2.js

A app2,js é uma aplicação que deve ser aberta numa outra janela (shell) e essa aplicação faz subscribe apenas em mensagens de temperatura. 

```
var mqtt = require("mqtt");
var client = mqtt.connect("mqtt://broker.emqx.io"); // broker.emqx.io

client.on("connect", function () {
  console.log("Conectou no servidor local Mosquitto");
});

client.subscribe("temperatura");

client.on("message", function (topic, message) {
  // message is Buffer
  console.log("recebeu msg do topico:" + topic);
  console.log(message.toString());
});
```

## Exemplo  no arduino

Na mesma pasta de exemplo existe uma subpasta com uma aplicação para o ESP32. Essa aplicação usa uma biblioteca para conectar no broker público e faz subscribe nas mesmas filas de mensagens. Além disso, caso receba mensagens de ledVERDE ou ledVERMELHO a aplicação liga ou desliga o led correspondente.

Assim, ao rodar o app.js do node podemos ver as luzes do ESP ligarem e desligarem.

## Usando o CLI

Podemos instalar uma aplicação de CLI para o mqtt e assim na linha de comando conectar num servidor, publicar mensagens numa fila ou ler mensagens de uma fila

No site: https://mqttx.app/cli  existe um mqtt cli. Após instalá-lo podemos conectar no servidor público

curl -LO https://www.emqx.com/en/downloads/MQTTX/v1.13.0/mqttx-cli-linux-x64
sudo install ./mqttx-cli-linux-x64 /usr/local/bin/mqttx

```
mqttx c onn  -h broker.emqx.io -p 1883 -i meuCliente
```

Depois disso, podemos publicar mensagens em filas:

```
mqttx pub -h broker.emqx.io -p 1883 -t ledVERMELHO -m 1
acende o led


mqttx pub -h broker.emqx.io -p 1883 -t ledVERMELHO -m 0
apaga o led
```

Com esse exemplo vimos como  controlar dispositivos pela Internet (ESP32) usando nosso código em nodeJS sem necessidade problemas com firewall e NAT da rede local