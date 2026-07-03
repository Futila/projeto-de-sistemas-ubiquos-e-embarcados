from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from access_control.models import Fechadura, AcessoTemporario, HistoricoEvento

MOCK_FECHADURAS = [
    {"nome": "Porta Principal - Casa Praia", "id_dispositivo": "AA:BB:CC:11:22:01", "esta_online": True},
    {"nome": "Porta dos Fundos - Casa Praia", "id_dispositivo": "AA:BB:CC:11:22:02", "esta_online": False},
    {"nome": "Portão Garagem - Apto 101", "id_dispositivo": "AA:BB:CC:11:22:03", "esta_online": True},
    {"nome": "Porta Principal - Apto 201", "id_dispositivo": "AA:BB:CC:11:22:04", "esta_online": True},
    {"nome": "Porta Piscina - Chalé Serra", "id_dispositivo": "AA:BB:CC:11:22:05", "esta_online": False},
    {"nome": "Entrada Principal - Chalé Serra", "id_dispositivo": "AA:BB:CC:11:22:06", "esta_online": True},
]


class Command(BaseCommand):
    help = "Cria dados de demonstração: usuário anfitrião, fechaduras e reservas mock"

    def handle(self, *args, **options):
        agora = timezone.now()

        # Cria ou recupera o usuário de demonstração
        email = "anfitriao@demo.com"
        user, created = User.objects.get_or_create(
            username=email,
            defaults={
                "email": email,
                "first_name": "Fernando",
                "last_name": "Demo",
            },
        )
        if created:
            user.set_password("demo12345")
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Usuário criado: {email} / demo12345"))
        else:
            self.stdout.write(f"Usuário já existe: {email}")

        # Cria as fechaduras mock
        fechaduras_obj = []
        criadas = 0
        for dados in MOCK_FECHADURAS:
            fechadura, novo = Fechadura.objects.get_or_create(
                id_dispositivo=dados["id_dispositivo"],
                defaults={
                    "nome": dados["nome"],
                    "proprietario": user,
                    "esta_online": dados["esta_online"],
                    "ultima_comunicacao": agora - timedelta(minutes=5) if dados["esta_online"] else agora - timedelta(hours=6),
                },
            )
            fechaduras_obj.append(fechadura)
            if novo:
                criadas += 1

        self.stdout.write(self.style.SUCCESS(
            f"{criadas} fechaduras criadas ({len(MOCK_FECHADURAS) - criadas} já existiam)."
        ))

        # Mocks de AcessoTemporario se ainda não existirem em quantidade suficiente
        if AcessoTemporario.objects.count() >= 6:
            self.stdout.write("Reservas já existem em quantidade suficiente — pulando seed.")
        else:
            f1, f2, f3, f4 = fechaduras_obj[0], fechaduras_obj[1], fechaduras_obj[2], fechaduras_obj[3]

            reservas = [
                AcessoTemporario(
                    fechadura=f1,
                    hospede_identificador="joao.silva@email.com",
                    inicio_reserva=agora - timedelta(days=2),
                    fim_reserva=agora + timedelta(days=3),
                    status="ATIVO",
                ),
                AcessoTemporario(
                    fechadura=f1,
                    hospede_identificador="maria.oliveira@email.com",
                    inicio_reserva=agora + timedelta(days=5),
                    fim_reserva=agora + timedelta(days=8),
                    status="AGENDADO",
                ),
                AcessoTemporario(
                    fechadura=f2,
                    hospede_identificador="carlos.mendes@email.com",
                    inicio_reserva=agora - timedelta(days=10),
                    fim_reserva=agora - timedelta(days=7),
                    status="EXPIRADO",
                ),
                AcessoTemporario(
                    fechadura=f3,
                    hospede_identificador="ana.santos@email.com",
                    inicio_reserva=agora + timedelta(days=1),
                    fim_reserva=agora + timedelta(days=4),
                    status="PENDENTE",
                ),
                AcessoTemporario(
                    fechadura=f4,
                    hospede_identificador="pedro.lima@email.com",
                    inicio_reserva=agora - timedelta(days=5),
                    fim_reserva=agora + timedelta(days=1),
                    status="ATIVO",
                ),
                AcessoTemporario(
                    fechadura=f4,
                    hospede_identificador="lucia.costa@email.com",
                    inicio_reserva=agora - timedelta(days=20),
                    fim_reserva=agora - timedelta(days=15),
                    status="REVOGADO",
                ),
            ]
            AcessoTemporario.objects.bulk_create(reservas)
            self.stdout.write(self.style.SUCCESS(f"{len(reservas)} reservas mock criadas."))

        # Histórico de eventos mock
        if HistoricoEvento.objects.count() >= 10:
            self.stdout.write("Eventos já existem em quantidade suficiente — pulando seed.")
        else:
            f1, f2, f3 = fechaduras_obj[0], fechaduras_obj[1], fechaduras_obj[2]
            eventos = [
                HistoricoEvento(fechadura=f1, tipo='ACESSO', descricao='Porta aberta pelo anfitrião via dashboard', timestamp=agora - timedelta(minutes=10)),
                HistoricoEvento(fechadura=f1, tipo='SISTEMA', descricao='Dispositivo conectado ao broker MQTT', timestamp=agora - timedelta(hours=1)),
                HistoricoEvento(fechadura=f1, tipo='ALERTA_GAS', valor_sensor='0.0320', descricao='Nível de gás acima do normal detectado', timestamp=agora - timedelta(hours=3)),
                HistoricoEvento(fechadura=f1, tipo='ACESSO', descricao='Porta aberta pelo hóspede joao.silva@email.com', timestamp=agora - timedelta(hours=5)),
                HistoricoEvento(fechadura=f2, tipo='SISTEMA', descricao='Dispositivo desconectado — timeout heartbeat', timestamp=agora - timedelta(hours=6)),
                HistoricoEvento(fechadura=f2, tipo='ALERTA_FUMACA', valor_sensor='0.0158', descricao='Partículas de fumaça detectadas pelo sensor MQ-2', timestamp=agora - timedelta(hours=7)),
                HistoricoEvento(fechadura=f2, tipo='ACESSO', descricao='Porta aberta via token de resgate', timestamp=agora - timedelta(days=1)),
                HistoricoEvento(fechadura=f3, tipo='ACESSO', descricao='Porta aberta pelo anfitrião via app móvel', timestamp=agora - timedelta(days=1, hours=2)),
                HistoricoEvento(fechadura=f3, tipo='SISTEMA', descricao='Atualização de firmware concluída — v1.2.0', timestamp=agora - timedelta(days=2)),
                HistoricoEvento(fechadura=f3, tipo='ALERTA_GAS', valor_sensor='0.0095', descricao='Nível normal de gás (leitura de rotina)', timestamp=agora - timedelta(days=2, hours=1)),
                HistoricoEvento(fechadura=f1, tipo='ACESSO', descricao='Porta aberta automaticamente no início da reserva', timestamp=agora - timedelta(days=2, hours=3)),
                HistoricoEvento(fechadura=f1, tipo='SISTEMA', descricao='Reinicialização do dispositivo após queda de energia', timestamp=agora - timedelta(days=3)),
            ]
            HistoricoEvento.objects.bulk_create(eventos)
            self.stdout.write(self.style.SUCCESS(f"{len(eventos)} eventos mock criados."))

        self.stdout.write(self.style.SUCCESS("Login: anfitriao@demo.com / demo12345"))

