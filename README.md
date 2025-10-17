# Homework Bot — WebApp
Готовая веб‑панель (статическая) + опциональный FastAPI backend.

## Как использовать на GitHub Pages
1. Залейте содержимое папки в публичный репозиторий.
2. Включите GitHub Pages (branch `main`, folder `/`).
3. По умолчанию панель работает в **статическом режиме** (данные в LocalStorage, только демонстрация).

## Подключить к вашему бэкенду
1. Разместите `webapi.py` рядом с вашим ботом и выполните:
   ```bash
   pip install fastapi uvicorn
   uvicorn webapi:app --host 0.0.0.0 --port 8000
   ```
2. Откройте сайт и в консоли браузера выполните:
   ```js
   localStorage.setItem('api_base','http://YOUR_IP:8000');
   location.reload();
   ```

## Интеграция с Telegram WebApp
- Файл `index.html` подключает SDK Telegram. Если открыть сайт из кнопки `web_app` в боте, в шапке появится ваш юзернейм.
- В боте добавьте кнопку:
  ```python
  from telebot import types
  kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
  kb.add(types.WebAppInfo(url="https://username.github.io/your-repo/"))
  ```

## Соответствие разделам (ваши примеры)
- repository‑1/7 — создание/редактирование класса → вкладка **Классы** (пока заглушка, т.к. в БД нет таблицы классов).
- repository‑2/3 — поиск класса → **Классы**.
- repository‑4/5/6/8/9 — пользователи/инфо → **Пользователи**.
- repository‑14 — отключение бота → **Режимы** (каникулы/техработы).
- repository‑15 — рассылка → **Оповещения**.
- repository‑16 — каникулы → **Режимы**.
- repository‑12/13 — lessons → **ДЗ/Расписание**.

## Примечание
- В SQLite Telegram `file_id` недоступен как прямая ссылка. В демо я показываю заглушки `telegram-file:...`. Для реального показа картинок с расписанием сделайте эндпоинт, который, имея `file_id`, попросит у Telegram `getFile` и отдаст `file_path` как прокси.
