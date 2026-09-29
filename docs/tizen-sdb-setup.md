# Connect to a Samsung TV over SDB (Tizen)

## 1. Install Tizen Studio CLI tools

Download the Tizen Studio installer for Linux from
https://developer.tizen.org/development/tizen-studio/download, then:

```bash
chmod +x web-cli_Tizen_Studio_*_ubuntu-64.bin
./web-cli_Tizen_Studio_*_ubuntu-64.bin --accept-license ~/tizen-studio
```

Add the tools to your PATH (`~/.zshrc`):

```bash
export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
```

```bash
source ~/.zshrc
sdb version
```

## 2. Enable Developer Mode on the TV

1. Open **Apps** on the TV.
2. Type `12345` with the remote's number pad.
3. Set **Developer mode** to **On**.
4. Enter your computer's IP as **Host PC IP**. Find it with:
   ```bash
   hostname -I | awk '{print $1}'
   ```
5. Restart the TV (hold power until it turns off, then turn it on).

## 3. Connect

Your PC and the TV must be on the same network. Get the TV's IP from
**Settings → General → Network → Network Status → IP Settings**.

```bash
sdb connect <TV_IP>
sdb devices
```

Expected output:

```
List of devices attached
<TV_IP>:26101    device    <model>
```

If the status is `offline` or `unauthorized`, run:

```bash
sdb disconnect <TV_IP>
sdb connect <TV_IP>
```

## 4. Install and run the app

```bash
apps/tizen/scripts/build-prod.sh    # build, package and install the prod app
apps/tizen/scripts/install-dev.sh   # package and install the dev shell
```

Both install through `apps/tizen/scripts/install-wgt.sh`. Don't use
`sdb install` on this TV: it uploads the package and exits without
installing anything, and prints no error. The helper pushes the `.wgt` and runs the TV's
installer itself:

```bash
sdb push <app>.wgt /home/owner/share/tmp/sdk_tools/tmp/<app>.wgt
sdb shell 0 vd_appinstall <app_id> /home/owner/share/tmp/sdk_tools/tmp/<app>.wgt
sdb shell 0 was_execute <app_id>    # launch
```

`<app_id>` is the `id` of `<tizen:application>` in the project's
`config.xml` (e.g. `Go10TVprd1.GO10TV`).

## 5. Debug (optional)

```bash
sdb shell 0 debug <app_id>    # launches the app, prints the debug port
sdb forward tcp:9222 tcp:<debug_port>
```

Then open `chrome://inspect` in Chrome (add `localhost:9222` under
**Configure…** if it isn't listed) and click **inspect** on the app.
