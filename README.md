# UltraPrism

Это интерфейс UltraPrism поверх [ElyPrismLauncher](https://github.com/ElyPrismLauncher/ElyPrismLauncher). Страница на [http://127.0.0.1:43123](http://127.0.0.1:43123) читает папку ElyPrism и вызывает установленный `elyprismlauncher`: запуск сборки, импорт, окно сборки, аккаунты и настройки.

На Windows папка данных — `%AppData%\ElyPrismLauncher`, программа обычно лежит в `%LocalAppData%\Programs\ElyPrismLauncher\elyprismlauncher.exe`. Из WSL UltraPrism сам ищет эти пути. Свои пути задаются переменными `ULTRAPRISM_ELY_DIR` и `ULTRAPRISM_ELY_EXE`.

Файл, собранный на сервере этого проекта, называется `launcher/build/Debug/elyprismlauncher` и запускается только на Linux. На Windows его не открыть и им нельзя заменить установленный ElyPrism.

## Одна кнопка на Windows

После того как репозиторий лежит в WSL в папке `~/ultraprism` и установлен Node.js 22, кнопка запуска — файл `UltraPrism.bat`.

1. В проводнике откройте `\\wsl$\Ubuntu\home\<имя>\ultraprism` (вместо Ubuntu может быть другое имя дистрибутива).
2. Скопируйте `UltraPrism.bat` на рабочий стол.
3. Дальше каждый запуск — двойной щелчок по этому файлу на рабочем столе. Он поднимает интерфейс и открывает браузер на http://127.0.0.1:43123.

Первый щелчок дольше: ставятся зависимости. Окно Ubuntu при этом открывать не нужно.

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

Кнопка «Запустить» вызывает `elyprismlauncher --launch`. Каталог Modrinth в боковой панели ищет моды, сборки, ресурспаки и шейдеры и ставит их в папку ElyPrism без окна лаунчера. CurseForge, вход в аккаунт, экспорт и удаление сборки открываются окном установленного ElyPrism. Движение настраивается в студии: «Нет», «Тихо» или «Заметно». Системное «уменьшить движение» останавливает анимации.

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
