from django.contrib import admin
from .models import Fechadura, AcessoTemporario, HistoricoEvento

@admin.register(Fechadura)
class FechaduraAdmin(admin.ModelAdmin):
    list_display = ('nome', 'id_dispositivo', 'proprietario', 'esta_online', 'ultima_comunicacao')
    list_filter = ('esta_online', 'proprietario')
    search_fields = ('nome', 'id_dispositivo')

@admin.register(AcessoTemporario)
class AcessoAdmin(admin.ModelAdmin):
    list_display = ('hospede_identificador', 'fechadura', 'inicio_reserva', 'fim_reserva', 'status')
    list_filter = ('status', 'fechadura')

@admin.register(HistoricoEvento)
class EventoAdmin(admin.ModelAdmin):
    list_display = ('fechadura', 'tipo', 'valor_sensor', 'timestamp')
    list_filter = ('tipo', 'fechadura')