"""
MQTT Subscriber — Django Management Command

Mantém uma conexão MQTT persistente com o HiveMQ Cloud e processa
mensagens enviadas pelo firmware do ESP32.

Tópicos assinados:
  v1/locks/+/status   → "ONLINE" / "OFFLINE"
      → atualiza Fechadura.esta_online e ultima_comunicacao

  v1/locks/+/sensors  → JSON com leituras do MQ-2 e DHT22
      → cria HistoricoEvento (ALERTA_GAS ou SISTEMA)
      → atualiza esta_online e ultima_comunicacao

Uso:
    python manage.py mqtt_subscriber

Execute em segundo plano durante os testes de integração.
Em produção, configure como serviço systemd ou processo supervisor.
"""

import json
import logging
import ssl

import paho.mqtt.client as mqtt
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Assina tópicos MQTT do firmware ESP32 e persiste eventos no banco"

    def handle(self, *args, **options):
        self.stdout.write("[MQTT Subscriber] Iniciando...")

        # Compatibilidade com paho-mqtt v1 e v2
        try:
            client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION1,
                client_id="django-subscriber",
                clean_session=True,
            )
        except AttributeError:
            client = mqtt.Client(client_id="django-subscriber", clean_session=True)

        client.username_pw_set(settings.MQTT_USER, settings.MQTT_PASSWORD)

        # TLS sem validação de certificado — adequado para protótipo
        client.tls_set(cert_reqs=ssl.CERT_NONE)
        client.tls_insecure_set(True)

        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.on_disconnect = self._on_disconnect

        self.stdout.write(f"[MQTT Subscriber] Conectando a {settings.MQTT_HOST}:{settings.MQTT_PORT}...")
        client.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=60)

        # Bloqueia o processo e processa mensagens indefinidamente
        client.loop_forever()

    # ── Callbacks ─────────────────────────────────────────────────────────────

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.stdout.write("[MQTT Subscriber] Conectado ao HiveMQ Cloud.")
            client.subscribe("v1/locks/+/status")
            client.subscribe("v1/locks/+/sensors")
            self.stdout.write("[MQTT Subscriber] Assinando v1/locks/+/status e v1/locks/+/sensors")
        else:
            self.stderr.write(f"[MQTT Subscriber] Falha na conexão (rc={rc}).")

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            self.stderr.write(f"[MQTT Subscriber] Desconectado inesperadamente (rc={rc}). Reconectando...")

    def _on_message(self, client, userdata, msg):
        topic   = msg.topic
        payload = msg.payload.decode("utf-8", errors="replace").strip()

        # Extrai id_dispositivo do tópico: v1/locks/{MAC}/status|sensors
        parts = topic.split("/")
        if len(parts) != 4 or parts[0] != "v1" or parts[1] != "locks":
            return

        id_dispositivo = parts[2]
        subtopic       = parts[3]

        # Import models aqui para evitar problemas de inicialização do Django
        from access_control.models import Fechadura, HistoricoEvento

        try:
            fechadura = Fechadura.objects.get(id_dispositivo=id_dispositivo)
        except Fechadura.DoesNotExist:
            logger.warning("[MQTT] Mensagem de dispositivo não cadastrado: %s", id_dispositivo)
            return

        if subtopic == "status":
            self._handle_status(fechadura, payload)
        elif subtopic == "sensors":
            self._handle_sensors(fechadura, payload)

    # ── Handlers por subtópico ─────────────────────────────────────────────────

    def _handle_status(self, fechadura, payload):
        """Atualiza esta_online e ultima_comunicacao da Fechadura."""
        from access_control.models import Fechadura
        online = payload == "ONLINE"
        Fechadura.objects.filter(pk=fechadura.pk).update(
            esta_online=online,
            ultima_comunicacao=timezone.now(),
        )
        label = "ONLINE" if online else "OFFLINE"
        self.stdout.write(f"[STATUS] {fechadura.id_dispositivo} → {label}")

    def _handle_sensors(self, fechadura, payload):
        """Processa leituras de sensores e cria HistoricoEvento."""
        from access_control.models import Fechadura, HistoricoEvento
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            logger.warning("[MQTT] Payload de sensores inválido: %s", payload)
            return

        # Sempre marca dispositivo como online quando recebe telemetria
        Fechadura.objects.filter(pk=fechadura.pk).update(
            esta_online=True,
            ultima_comunicacao=timezone.now(),
        )

        alerta_gas  = data.get("alerta_gas", False)
        gas_valor   = data.get("gas")
        temp_valor  = data.get("temperatura")
        umid_valor  = data.get("umidade")

        if alerta_gas:
            HistoricoEvento.objects.create(
                fechadura=fechadura,
                tipo="ALERTA_GAS",
                valor_sensor=gas_valor,
                descricao=(
                    f"Alerta de gás detectado pelo sensor MQ-2 — "
                    f"nível normalizado: {gas_valor}"
                ),
            )
            self.stdout.write(
                self.style.WARNING(
                    f"[ALERTA_GAS] {fechadura.id_dispositivo} — gás: {gas_valor}"
                )
            )
        else:
            # Registra telemetria periódica de temperatura como evento SISTEMA
            temp_valida = temp_valor is not None and float(temp_valor) > -99
            if temp_valida:
                HistoricoEvento.objects.create(
                    fechadura=fechadura,
                    tipo="SISTEMA",
                    valor_sensor=temp_valor,
                    descricao=(
                        f"Telemetria: temperatura={temp_valor}°C, "
                        f"umidade={umid_valor}%, gás={gas_valor}"
                    ),
                )
                self.stdout.write(
                    f"[SENSOR] {fechadura.id_dispositivo} — "
                    f"temp: {temp_valor}°C, umidade: {umid_valor}%, gás: {gas_valor}"
                )
