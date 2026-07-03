"""
Signals do app access_control.

Responsabilidade: sincronizar automaticamente o token BLE no ESP32 sempre
que o status de um AcessoTemporario mudar, sem exigir chamadas manuais nas views.

Fluxo:
  status → ATIVO    : publica SET_BLE_TOKEN  → ESP32 armazena token na NVS
  status → REVOGADO : publica CLEAR_BLE_TOKEN → ESP32 apaga token da NVS

O firmware lida com SET_BLE_TOKEN / CLEAR_BLE_TOKEN em mqttCallback().
"""

import json
import ssl
import logging

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.conf import settings

import paho.mqtt.publish as publish

from .models import AcessoTemporario

logger = logging.getLogger(__name__)


# =============================================================================
#  Helpers MQTT — reutilizados pelos signals e pela view sincronizar_ble
# =============================================================================

def _mqtt_topic_commands(acesso: AcessoTemporario) -> str:
    return f"v1/locks/{acesso.fechadura.id_dispositivo}/commands"


def publicar_set_ble_token(acesso: AcessoTemporario) -> None:
    """Envia o token da reserva ao ESP32 para que ele possa validar acesso BLE offline."""
    payload = json.dumps({
        "cmd":   "SET_BLE_TOKEN",
        "token": acesso.token_resgate,
        "fim":   acesso.fim_reserva.isoformat(),
    })
    _publicar_mqtt(acesso, payload)
    logger.info("[BLE] SET_BLE_TOKEN enviado para %s", acesso.fechadura.id_dispositivo)


def publicar_clear_ble_token(acesso: AcessoTemporario) -> None:
    """Remove o token do ESP32 (reserva revogada ou expirada)."""
    payload = json.dumps({"cmd": "CLEAR_BLE_TOKEN"})
    _publicar_mqtt(acesso, payload)
    logger.info("[BLE] CLEAR_BLE_TOKEN enviado para %s", acesso.fechadura.id_dispositivo)


def _publicar_mqtt(acesso: AcessoTemporario, payload: str) -> None:
    topic = _mqtt_topic_commands(acesso)
    try:
        publish.single(
            topic,
            payload=payload,
            hostname=settings.MQTT_HOST,
            port=settings.MQTT_PORT,
            auth={'username': settings.MQTT_USER, 'password': settings.MQTT_PASSWORD},
            tls={'cert_reqs': ssl.CERT_NONE, 'tls_version': ssl.PROTOCOL_TLS},
        )
    except Exception as exc:
        # Não interrompe o fluxo — ESP32 pode estar offline; o endpoint
        # sincronizar_ble permite reenvio manual quando o dispositivo voltar.
        logger.warning("[BLE] Falha ao publicar MQTT (%s): %s", topic, exc)


# =============================================================================
#  Signals
# =============================================================================

@receiver(pre_save, sender=AcessoTemporario)
def capturar_status_anterior(sender, instance, **kwargs):
    """
    Armazena o status atual (antes do save) em _status_anterior para que
    post_save possa detectar a transição exata.
    """
    if instance.pk:
        try:
            instance._status_anterior = AcessoTemporario.objects.get(pk=instance.pk).status
        except AcessoTemporario.DoesNotExist:
            instance._status_anterior = None
    else:
        instance._status_anterior = None


@receiver(post_save, sender=AcessoTemporario)
def sincronizar_token_ble(sender, instance, created, **kwargs):
    """
    Dispara sincronização BLE nas transições de status relevantes.

    · → ATIVO    : envia SET_BLE_TOKEN  (reserva ativa, hóspede pode usar BLE)
    · → REVOGADO : envia CLEAR_BLE_TOKEN (acesso cancelado)
    · → EXPIRADO : envia CLEAR_BLE_TOKEN (prazo encerrado, housekeeping)
    """
    if created:
        return

    anterior = getattr(instance, '_status_anterior', None)
    atual    = instance.status

    if anterior == atual:
        return

    if atual == 'ATIVO':
        publicar_set_ble_token(instance)
    elif atual in ('REVOGADO', 'EXPIRADO') and anterior not in ('REVOGADO', 'EXPIRADO'):
        publicar_clear_ble_token(instance)
