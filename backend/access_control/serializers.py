from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Fechadura, AcessoTemporario, HistoricoEvento

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['first_name', 'username', 'email', 'password']

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
        )
        return user

class FechaduraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fechadura
        fields = '__all__'
        read_only_fields = ['proprietario', 'id_unico', 'esta_online', 'ultima_comunicacao']

class AcessoTemporarioSerializer(serializers.ModelSerializer):
    # Mostra o nome da fechadura em vez de apenas o ID
    fechadura_nome = serializers.ReadOnlyField(source='fechadura.nome')
    
    class Meta:
        model = AcessoTemporario
        fields = ['id', 'fechadura', 'fechadura_nome', 'hospede_identificador', 
                  'token_resgate', 'inicio_reserva', 'fim_reserva', 'status']

class HistoricoEventoSerializer(serializers.ModelSerializer):
    fechadura_nome = serializers.ReadOnlyField(source='fechadura.nome')

    class Meta:
        model = HistoricoEvento
        fields = ['id', 'fechadura', 'fechadura_nome', 'tipo', 'valor_sensor', 'descricao', 'timestamp']