var mqtt = require("mqtt");
var client = mqtt.connect("mqtt://broker.emqx.io");
var valorLED = 0;
var valorVERMELHO = 0;

client.on("connect", function () {
  console.log("Conectou no servidor local Mosquitto");
});

client.subscribe("temperatura");
client.subscribe("alerta");
client.subscribe("ledVERMELHO");
client.subscribe("ledVERDE");

client.on("message", function (topic, message) {
  // message is Buffer
  switch (topic) {
    case "ledVERDE":
      console.log("MSG ledVerde:", message.toString());

      break;
    case "ledVERMELHO":
      console.log("MSG ledVermelho:", message.toString());

      break;
    case "temperatura":
      console.log("MSG temperatura:", message.toString());
      break;
    default:
      console.log("MSG desconhecida:", message.toString());
  }
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
