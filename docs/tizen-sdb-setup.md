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

Build the app as a `.wgt` package (with a Samsung certificate profile), then:

```bash
tizen install -n <app>.wgt -t <model_or_TV_IP>
tizen run -p <package_id> -t <model_or_TV_IP>
```

`<model_or_TV_IP>` is the device name shown by `sdb devices`.

## 5. Debug (optional)

```bash
tizen run -p <package_id> -t <model_or_TV_IP> -d   # prints the debug port
sdb forward tcp:9222 tcp:<debug_port>
```

Then open `http://localhost:9222` in Chrome to inspect the app.
