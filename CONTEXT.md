# Contexto do Projeto: Controle de Acesso Inteligente (IoT)

## 1. Visão Geral

Este é um Trabalho de Conclusão de Curso (TCC) da UFSC Araranguá. O objetivo é criar um sistema de gestão de acesso para imóveis de aluguel por temporada. O sistema permite que proprietários (Anfitriões) gerenciem múltiplas fechaduras eletrônicas (ESP32) e emitam chaves digitais temporárias para Hóspedes.

## 2. Arquitetura "Servidor Interceptador"

O sistema utiliza o Django como um cérebro central.

- O usuário NUNCA fala diretamente com o hardware via MQTT.
- O Frontend (React/React Native) faz requisições REST para o Django.
- O Django valida permissões e regras de negócio (ex: a reserva é válida hoje?).
- O Django atua como um cliente MQTT que publica comandos (ex: "OPEN") para o Broker HiveMQ.
- O hardware (ESP32) escuta os tópicos e executa a ação física.

## 3. Stack Tecnológica

- **Backend:** Django 5.x + Django REST Framework (DRF).
- **Frontend Web:** ReactJS + TypeScript + Tailwind CSS + Shadcn UI.
- **Frontend Mobile:** React Native + Expo + TypeScript.
- **Hardware/Firmware:** ESP32 + C++ (Arduino Framework) + Paho MQTT.
- **Banco de Dados:** SQLite3 (Desenvolvimento) / PostgreSQL (Produção).

## 4. Regras de Negócio e Modelos

- `Fechadura`: Mapeia o hardware físico via `id_dispositivo` (MAC Address).
- `AcessoTemporario`: Gere a permissão. Um hóspede (e-mail) recebe um `token_resgate`. A abertura só é permitida entre `inicio_reserva` e `fim_reserva`.
- `HistoricoEvento`: Registra telemetria de sensores (Gás, Fumaça, Temperatura) e logs de acesso. **Requisito crítico:** Precisão de pelo menos 4 algarismos significativos nos valores decimais.

## 5. Objetivo de Implementação Atual

Desenvolver o Dashboard do Anfitrião utilizando Shadcn UI. O Dashboard deve permitir:

1. Visualizar o status online/offline das fechaduras.
2. Confirmar pedidos de reserva (ativando instâncias de AcessoTemporario).
3. Visualizar logs de eventos e alertas de sensores em tempo real.
