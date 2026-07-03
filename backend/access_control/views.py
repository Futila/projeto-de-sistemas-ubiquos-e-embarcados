from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
from .models import Fechadura, AcessoTemporario, HistoricoEvento
from .serializers import FechaduraSerializer, UserRegistrationSerializer, AcessoTemporarioSerializer, HistoricoEventoSerializer
from .signals import publicar_set_ble_token, publicar_clear_ble_token
import ssl
import paho.mqtt.publish as publish


def _mqtt_publish(topic, payload):
    """Publica uma mensagem MQTT no HiveMQ Cloud com TLS e autenticação."""
    publish.single(
        topic,
        payload=payload,
        hostname=settings.MQTT_HOST,
        port=settings.MQTT_PORT,
        auth={'username': settings.MQTT_USER, 'password': settings.MQTT_PASSWORD},
        tls={'cert_reqs': ssl.CERT_NONE, 'tls_version': ssl.PROTOCOL_TLS},
    )


class FechaduraViewSet(viewsets.ModelViewSet):
    serializer_class = FechaduraSerializer

    def get_queryset(self):
        return Fechadura.objects.filter(proprietario=self.request.user)

    def perform_create(self, serializer):
        serializer.save(proprietario=self.request.user)

    @action(detail=True, methods=['post'])
    def abrir(self, request, pk=None):
        fechadura = self.get_object()
        topic = f"v1/locks/{fechadura.id_dispositivo}/commands"
        try:
            _mqtt_publish(topic, "OPEN")
            return Response({'status': f'Comando enviado para {topic}'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AcessoTemporarioViewSet(viewsets.ModelViewSet):
    queryset = AcessoTemporario.objects.select_related('fechadura').order_by('-id')
    serializer_class = AcessoTemporarioSerializer

    @action(detail=True, methods=['post'])
    def revogar(self, request, pk=None):
        acesso = self.get_object()
        if acesso.status in ('EXPIRADO', 'REVOGADO'):
            return Response({'error': 'Acesso já encerrado.'}, status=status.HTTP_400_BAD_REQUEST)
        acesso.status = 'REVOGADO'
        acesso.save()  # dispara o signal → CLEAR_BLE_TOKEN enviado automaticamente
        return Response(AcessoTemporarioSerializer(acesso).data)

    @action(detail=True, methods=['post'])
    def sincronizar_ble(self, request, pk=None):
        """
        Reenvia o token BLE ao ESP32 manualmente.

        Útil quando o dispositivo estava offline no momento em que a reserva
        foi ativada e não recebeu o SET_BLE_TOKEN original.
        Só funciona para reservas com status ATIVO.
        """
        acesso = self.get_object()
        if acesso.status != 'ATIVO':
            return Response(
                {'error': 'Sincronização BLE disponível apenas para reservas com status ATIVO.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            publicar_set_ble_token(acesso)
            return Response({'status': f'Token BLE reenviado para {acesso.fechadura.id_dispositivo}.'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class HistoricoEventoViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HistoricoEventoSerializer

    def get_queryset(self):
        qs = HistoricoEvento.objects.select_related('fechadura').order_by('-timestamp')
        fechadura_id = self.request.query_params.get('fechadura')
        if fechadura_id:
            qs = qs.filter(fechadura_id=fechadura_id)
        return qs


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user_id': user.id, 'email': user.email}, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user:
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user_id': user.id, 'email': user.email})
    return Response({'error': 'Credenciais inválidas.'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    user = request.user
    if request.method == 'GET':
        return Response({
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'username': user.username,
            'email': user.email,
        })
    data = request.data
    if 'first_name' in data:
        user.first_name = data['first_name']
    if 'last_name' in data:
        user.last_name = data['last_name']
    if 'email' in data:
        user.email = data['email']
        user.username = data['email']
    if 'password' in data:
        user.set_password(data['password'])
        Token.objects.filter(user=user).delete()
        Token.objects.get_or_create(user=user)
    user.save()
    return Response({
        'id': user.id,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'username': user.username,
        'email': user.email,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def hospede_resgatar(request):
    """
    Hóspede informa o token_resgate recebido do anfitrião.
    Retorna os dados do acesso e da fechadura se o token é válido.
    """
    token = request.data.get('token', '').strip().upper()
    if not token:
        return Response({'error': 'Informe o token de acesso.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        acesso = AcessoTemporario.objects.select_related('fechadura').get(token_resgate=token)
    except AcessoTemporario.DoesNotExist:
        return Response({'error': 'Token inválido ou não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if acesso.status == 'REVOGADO':
        return Response({'error': 'Este acesso foi revogado pelo anfitrião.'}, status=status.HTTP_403_FORBIDDEN)
    if acesso.status == 'EXPIRADO':
        return Response({'error': 'Este acesso expirou.'}, status=status.HTTP_403_FORBIDDEN)

    # Avança para AGENDADO se ainda estava PENDENTE
    if acesso.status == 'PENDENTE':
        acesso.status = 'AGENDADO'
        acesso.resgatado_em = timezone.now()
        acesso.save()

    return Response({
        'acesso_id': acesso.id,
        'token_resgate': acesso.token_resgate,
        'hospede_identificador': acesso.hospede_identificador,
        'status': acesso.status,
        'inicio_reserva': acesso.inicio_reserva,
        'fim_reserva': acesso.fim_reserva,
        'fechadura': {
            'id': acesso.fechadura.id,
            'nome': acesso.fechadura.nome,
            'esta_online': acesso.fechadura.esta_online,
        },
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def hospede_abrir(request):
    """
    Hóspede abre a porta usando seu token_resgate.
    Valida a janela de tempo antes de publicar o comando MQTT.
    """
    token = request.data.get('token', '').strip().upper()
    if not token:
        return Response({'error': 'Informe o token de acesso.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        acesso = AcessoTemporario.objects.select_related('fechadura').get(token_resgate=token)
    except AcessoTemporario.DoesNotExist:
        return Response({'error': 'Token inválido.'}, status=status.HTTP_404_NOT_FOUND)

    agora = timezone.now()

    if acesso.status == 'REVOGADO':
        return Response({'error': 'Este acesso foi revogado.'}, status=status.HTTP_403_FORBIDDEN)
    if acesso.status == 'EXPIRADO' or agora > acesso.fim_reserva:
        return Response({'error': 'Acesso expirado. O prazo da reserva encerrou.'}, status=status.HTTP_403_FORBIDDEN)
    if agora < acesso.inicio_reserva:
        return Response({'error': 'Reserva ainda não iniciou. Tente novamente na data de check-in.'}, status=status.HTTP_403_FORBIDDEN)

    # Garante status ATIVO
    if acesso.status != 'ATIVO':
        acesso.status = 'ATIVO'
        acesso.save()

    fechadura = acesso.fechadura
    topic = f"v1/locks/{fechadura.id_dispositivo}/commands"
    try:
        _mqtt_publish(topic, "OPEN")
        HistoricoEvento.objects.create(
            fechadura=fechadura,
            tipo='ACESSO',
            descricao=f'Porta aberta pelo hóspede {acesso.hospede_identificador} via app',
        )
        return Response({'status': 'Porta aberta com sucesso.'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)