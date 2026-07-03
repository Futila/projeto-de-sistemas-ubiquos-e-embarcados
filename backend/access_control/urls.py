from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    FechaduraViewSet, AcessoTemporarioViewSet, HistoricoEventoViewSet,
    register_user, login_user, user_profile,
    hospede_resgatar, hospede_abrir,
)

router = DefaultRouter()
router.register(r'fechaduras', FechaduraViewSet, basename='fechadura')
router.register(r'acessos', AcessoTemporarioViewSet)
router.register(r'eventos', HistoricoEventoViewSet, basename='eventos')

urlpatterns = [
    path('', include(router.urls)),
    path('users/', register_user, name='register'),
    path('users/me/', user_profile, name='user-profile'),
    path('auth/login/', login_user, name='login'),
    path('hospede/resgatar/', hospede_resgatar, name='hospede-resgatar'),
    path('hospede/abrir/', hospede_abrir, name='hospede-abrir'),
]