from django.db import models
import uuid
from django.contrib.auth.models import User
from django.utils import timezone


class Fechadura(models.Model):
  """
    Representa o hardware físico (ESP32) instalado no imovel. Cada fechadura tem um identificador único (UUID) e um nome para facilitar a identificação.
  """
  id_unico = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
  nome = models.CharField(max_length=100, help_text="Ex: Porta Principal - Apto 201")
  id_dispositivo = models.CharField(max_length=50, unique=True, help_text="ID/MAC do ESP32 para MQTT")
  proprietario = models.ForeignKey(User, on_delete=models.CASCADE, related_name='fechaduras')
  esta_online = models.BooleanField(default=False)
  ultima_comunicacao = models.DateTimeField(null=True, blank=True)
  criado_em = models.DateTimeField(auto_now_add=True)

  def __str__(self):
        return f"{self.nome} ({self.id_dispositivo})"
  


def gerar_token():
    return uuid.uuid4().hex[:12].upper()


class AcessoTemporario(models.Model):
    """
    Gere os convites e permissões de acesso vinculados às reservas.
    """
    STATUS_CHOICES = [
        ('PENDENTE', 'Aguardando Resgate'),
        ('AGENDADO', 'Resgate Concluído / Aguardando Data'),
        ('ATIVO', 'Acesso Autorizado'),
        ('EXPIRADO', 'Prazo Encerrado'),
        ('REVOGADO', 'Cancelado pelo Anfitrião'),
    ]

    fechadura = models.ForeignKey(Fechadura, on_delete=models.CASCADE, related_name='acessos')
    hospede_identificador = models.EmailField(help_text="E-mail do hóspede para validação")
    hospede_usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='minhas_chaves')
    
    token_resgate = models.CharField(max_length=12, default=gerar_token, unique=True)
    inicio_reserva = models.DateTimeField()
    fim_reserva = models.DateTimeField()
    
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDENTE')
    resgatado_em = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.hospede_identificador} -> {self.fechadura.nome}"
    
class HistoricoEvento(models.Model):
    """
    Logs de auditoria e telemetria dos sensores.
    """
    TIPO_EVENTO = [
        ('ACESSO', 'Abertura de Porta'),
        ('ALERTA_GAS', 'Detecção de Gás'),
        ('ALERTA_FUMACA', 'Detecção de Fumaça'),
        ('SISTEMA', 'Status do Dispositivo'),
    ]

    fechadura = models.ForeignKey(Fechadura, on_delete=models.CASCADE, related_name='eventos')
    tipo = models.CharField(max_length=20, choices=TIPO_EVENTO)
    # DecimalField garante a precisão solicitada de 4 algarismos significativos
    valor_sensor = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    descricao = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
