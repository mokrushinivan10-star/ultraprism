# UltraPrism

Это изменённые исходники [ElyPrismLauncher](https://github.com/ElyPrismLauncher/ElyPrismLauncher) (ветка `develop`). Исходники одни и те же для Windows и Linux. При запуске программы окно ElyPrism не показывается: открывается интерфейс UltraPrism на [http://127.0.0.1:43123](http://127.0.0.1:43123).

Файл, собранный на сервере этого проекта, называется `launcher/build/Debug/elyprismlauncher` и запускается только на Linux. На Windows его не открыть и им нельзя заменить установленный ElyPrism. Переходить на Linux не нужно: для Windows нужен свой `elyprismlauncher.exe`, его получают сборкой того же каталога `launcher` на Windows.

Проект не связан с Prism Launcher, Ely.by и Mojang и не одобрен ими. Код лаунчера остаётся под GPL-3.0-only, см. `launcher/COPYING.md`. Ключи Microsoft, Ely.by и CurseForge в этой сборке пустые.

Интерфейс — страница в корне репозитория. Данные лаунчера по-прежнему ищутся в каталоге ElyPrism (`%AppData%\ElyPrismLauncher` на Windows), если не передан `--dir`.

## Собрать на Windows

Нужны [зависимости Prism Launcher для Windows](https://prismlauncher.org/wiki/development/build-instructions/) (Visual Studio 2022 или MSYS2, Qt 6, JDK 17, CMake, Ninja) и Node.js 22.

В PowerShell из корня репозитория сначала интерфейс:

```powershell
npm install
npm run dev
```

В другом окне, в среде сборки Prism (x64 Native Tools или MSYS2 CLANG64):

```powershell
cd launcher
cmake --preset windows_msvc -DENABLE_LTO=OFF
cmake --build build --config Debug --target ElyPrismLauncher
```

Для MSYS2 пресет называется `windows_mingw`. Готовый exe: `launcher\build\Debug\elyprismlauncher.exe`. Вернитесь в корень репозитория и запустите:

```powershell
cd ..
$env:ULTRAPRISM_DIR = (Get-Location).Path
.\launcher\build\Debug\elyprismlauncher.exe
```

Если порт 43123 свободен, лаунчер сам выполнит `npm run dev` или `npm run start`, когда сборка Next уже есть.

## Сборка, которая уже сделана на Linux

На Ubuntu 24.04 системный Qt 6.4, поэтому в дереве есть небольшие правки под этот Qt. Команды ниже относятся только к Linux-серверу:

```bash
cd launcher
cmake --preset linux -DENABLE_LTO=OFF
cmake --build build --config Debug --target ElyPrismLauncher
ULTRAPRISM_DIR="$PWD/.." ./build/Debug/elyprismlauncher
```

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
