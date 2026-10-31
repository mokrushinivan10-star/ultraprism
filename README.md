# UltraPrism

Это изменённые исходники [ElyPrismLauncher](https://github.com/ElyPrismLauncher/ElyPrismLauncher) (ветка `develop`). При запуске бинарника `elyprismlauncher` окно ElyPrism не показывается: открывается интерфейс UltraPrism на [http://127.0.0.1:43123](http://127.0.0.1:43123).

Проект не связан с Prism Launcher, Ely.by и Mojang и не одобрен ими. Код лаунчера остаётся под GPL-3.0-only, см. `launcher/COPYING.md`. Ключи Microsoft, Ely.by и CurseForge в этой сборке пустые.

Интерфейс — страница в корне репозитория. Данные лаунчера по-прежнему ищутся в каталоге ElyPrism (`ElyPrismLauncher`), если не передан `--dir`.

## Собрать лаунчер

Нужны зависимости из [инструкции Prism Launcher](https://prismlauncher.org/wiki/development/build-instructions/) и JDK 17. На Ubuntu 24.04 системный Qt 6.4, поэтому в дереве есть небольшие правки под этот Qt.

```bash
cd launcher
cmake --preset linux -DENABLE_LTO=OFF
cmake --build build --config Debug --target ElyPrismLauncher
```

Запуск из корня репозитория. Сначала поднимите интерфейс (`npm install && npm run dev` в корне), затем:

```bash
ULTRAPRISM_DIR="$PWD" ./launcher/build/Debug/elyprismlauncher
```

Если порт 43123 свободен, лаунчер сам выполнит `npm run dev` или `npm run start`, если сборка Next уже есть. Каталог данных можно указать отдельно: `--dir /путь/к/данным`.

На Windows собирайте тот же каталог `launcher` по инструкции Prism (MSVC или MSYS2). Готовый Linux-бинарник в установленный Windows ElyPrism не подставляется.

Карточки миров в интерфейсе лежат в браузере отдельно от темы. Каталог данных ElyPrism лаунчер по-прежнему открывает при старте.

Движение настраивается в студии: «Нет», «Тихо» или «Заметно». В «Заметно» разделы и карточки входят плавно, а окно запуска открывает шаги по очереди. Кнопка «Записать отметку» включается, когда проверка заканчивается. Системное «уменьшить движение» останавливает эти анимации.

## Запуск

Нужен Node.js 22.

```bash
npm install
npm run dev
```

Приложение откроется на [http://127.0.0.1:43123](http://127.0.0.1:43123).

Проверка, что тема не может записать хранилище миров:

```bash
npm test
```

## Руководство в Obsidian

Полный текст — в папке `vault`. В Obsidian выберите «Открыть папку как хранилище» и укажите `vault`. Первая заметка — `Добро пожаловать`.

Короткая версия тех же шагов есть в разделе «Руководство» внутри лаунчера.

## Где что лежит

| Путь | Содержание |
| --- | --- |
| `src/components/launcher` | Окно: библиотека, студия, миры, аккаунты |
| `src/lib/theme.ts` | Темы, контраст, разбор импорта |
| `src/lib/worlds-guard.ts` | Запрет писать миры из темы |
| `vault` | Хранилище Obsidian |
