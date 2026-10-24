# Installing Goldcom Studio

You install Goldcom Studio once. After that you start it from a shortcut, and it updates itself
when you click a button. You never need to download it from GitHub again.

## 1. Install (one time)

### Windows

1. Click the **Start** button, type `PowerShell` and open **Windows PowerShell**.
2. Copy this line, paste it into the blue window (right-click pastes), and press **Enter**:

   ```
   irm https://raw.githubusercontent.com/0ceanmind/goldcom/claude/friendly-ritchie-ou0783/install/install-windows.ps1 | iex
   ```

3. If Windows asks for permission to install **Node.js** or **Git**, click **Yes**.

The installer puts Goldcom in your user folder (`C:\Users\<you>\Goldcom`), adds a
**Goldcom Studio** shortcut to your Desktop and opens the studio in your browser.

**Already downloaded the ZIP?** Unzip it, open the folder and double-click
**Install Goldcom Studio.cmd**. If Windows shows "Windows protected your PC", click
**More info**, then **Run anyway**. It adds the Desktop shortcut and starts the studio.

### Mac

1. Open **Terminal** (press Cmd + Space, type `Terminal`, press Enter).
2. Paste this line and press **Enter**:

   ```
   curl -fsSL https://raw.githubusercontent.com/0ceanmind/goldcom/claude/friendly-ritchie-ou0783/install/install-mac-linux.sh | bash
   ```

If it says Node.js is missing, install the **LTS** version from [nodejs.org](https://nodejs.org),
then paste the line again. The installer puts Goldcom in your home folder (`Goldcom`) and adds a
**Goldcom Studio** shortcut to your Desktop.

### Linux

Same line as the Mac, in a terminal. The shortcut appears in your applications menu.

## 2. Start the studio

Double-click **Goldcom Studio** on your Desktop. A small window opens and the studio appears in
your browser at <http://localhost:5177>. The very first start takes a few minutes while it sets
itself up; later starts take a few seconds.

Keep the small window open while you work. Closing it stops the studio.

## 3. Updates

When a new version is available, the studio shows **Update available**. Click it: the studio
downloads the new version, installs it and restarts by itself. Your browser page reloads when it
is ready. Nothing else to do.

## Your designs are safe

Your designs, uploads and settings are stored in the `studio/data` folder inside the Goldcom
folder (for example `C:\Users\<you>\Goldcom\studio\data`). Updates never change or delete this
folder. To make a backup, copy that folder somewhere safe.

## If something goes wrong

- **The studio does not open:** close the small window and double-click the shortcut again.
- **An update failed:** the studio keeps working on the previous version. Try again later, or
  run the install line again (it updates the existing install and keeps your designs).
- **Still stuck:** run the install line again. It never deletes your designs.
