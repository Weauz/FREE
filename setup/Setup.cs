// FREE-Installation.exe - installateur / desinstallateur de FREE (NetLance)
// Compile sous Linux avec mono mcs, cible .NET Framework 4.x (present sur tout Windows 10/11).
// Contenu embarque : payload.zip (FREE.exe, LISEZ-MOI.txt, ressources\...) et logo.png.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Installation de FREE")]
[assembly: AssemblyDescription("Installe FREE - French Reverse Engineer Everything")]
[assembly: AssemblyCompany("NetLance")]
[assembly: AssemblyProduct("FREE")]
[assembly: AssemblyCopyright("© 2026 NetLance")]
[assembly: AssemblyVersion("1.3.0.0")]
[assembly: AssemblyFileVersion("1.3.0.0")]

static class Setup
{
    public const string Version = "1.3.0";
    public const string UninstKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\FREE";
    public const string UninstExe = "Desinstaller-FREE.exe";
    public static readonly Color Blue = Color.FromArgb(36, 80, 214);
    public static readonly Color Ink = Color.FromArgb(31, 35, 40);
    public static readonly Color Muted = Color.FromArgb(101, 109, 118);

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            if (args.Length > 0 && string.Equals(args[0], "/uninstall", StringComparison.OrdinalIgnoreCase))
                Uninstaller.Run(args);
            else if (args.Length > 0 && string.Equals(args[0], "/maj", StringComparison.OrdinalIgnoreCase))
                Installer.Update();
            else
                Application.Run(new InstallForm());
        }
        catch (Exception ex)
        {
            MessageBox.Show("Erreur inattendue :\n\n" + ex.Message, "FREE", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    public static string DefaultDir()
    {
        try
        {
            using (var k = Registry.CurrentUser.OpenSubKey(UninstKey))
            {
                var loc = k == null ? null : k.GetValue("InstallLocation") as string;
                if (!string.IsNullOrEmpty(loc)) return loc;
            }
        }
        catch { }
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs\\FREE");
    }

    public static string StartMenuLnk { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "FREE.lnk"); } }
    public static string DesktopLnk { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "FREE.lnk"); } }

    public static Image Logo()
    {
        try
        {
            var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png");
            if (s != null) return Image.FromStream(s);
        }
        catch { }
        return null;
    }

    public static Icon AppIcon()
    {
        try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { return SystemIcons.Application; }
    }

    // --- Arret de FREE s'il tourne (sauvegarde propre via le serveur local) ---
    static bool ServerUp()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:4747/api/updates");
            req.Timeout = 1500; req.Proxy = null;
            using (var res = (HttpWebResponse)req.GetResponse()) return (int)res.StatusCode < 500;
        }
        catch { return false; }
    }

    static Process[] FreeProcesses()
    {
        try { return Process.GetProcessesByName("FREE"); } catch { return new Process[0]; }
    }

    public static bool FreeRunning() { return FreeProcesses().Length > 0 || ServerUp(); }

    public static void StopFree(Action<string> status)
    {
        if (ServerUp())
        {
            status("Fermeture de FREE (sauvegarde en cours)…");
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:4747/api/save-and-quit");
                req.Method = "POST"; req.ContentType = "application/json"; req.Timeout = 5000; req.Proxy = null;
                var body = Encoding.UTF8.GetBytes("{}");
                req.ContentLength = body.Length;
                using (var st = req.GetRequestStream()) st.Write(body, 0, body.Length);
                req.GetResponse().Close();
            }
            catch { }
            for (int i = 0; i < 60 && ServerUp(); i++) Thread.Sleep(500);
        }
        for (int i = 0; i < 20 && FreeProcesses().Length > 0; i++) Thread.Sleep(500);
        foreach (var p in FreeProcesses()) { try { p.Kill(); p.WaitForExit(5000); } catch { } }
        Thread.Sleep(500);
    }

    public static void MakeShortcut(string lnk, string target, string workDir)
    {
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
        Type st = sc.GetType();
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { workDir });
        st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "FREE - French Reverse Engineer Everything" });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
    }

    public static void TryDelete(string f) { try { if (File.Exists(f)) File.Delete(f); } catch { } }

    public static long DirSizeKb(string dir)
    {
        long total = 0;
        try { foreach (var f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) { try { total += new FileInfo(f).Length; } catch { } } } catch { }
        return total / 1024;
    }

    // Supprime un dossier en retirant les attributs lecture seule (node_modules en contient parfois).
    public static void DeleteDir(string dir)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
        {
            try { File.SetAttributes(f, FileAttributes.Normal); } catch { }
        }
        for (int i = 0; i < 5; i++)
        {
            try { Directory.Delete(dir, true); return; }
            catch { Thread.Sleep(700); }
        }
    }

    public static Label MakeLabel(string text, float size, FontStyle style, Color color)
    {
        return new Label { Text = text, AutoSize = true, Font = new Font("Segoe UI", size, style), ForeColor = color, BackColor = Color.Transparent };
    }

    public static Panel Header(string title, string subtitle)
    {
        var head = new Panel { Dock = DockStyle.Top, Height = 92, BackColor = Color.White };
        var logo = Logo();
        if (logo != null) head.Controls.Add(new PictureBox { Image = logo, SizeMode = PictureBoxSizeMode.Zoom, Size = new Size(60, 60), Location = new Point(22, 16) });
        var t = MakeLabel(title, 15f, FontStyle.Bold, Ink); t.Location = new Point(94, 18);
        var s = MakeLabel(subtitle, 9.5f, FontStyle.Regular, Muted); s.Location = new Point(96, 52);
        head.Controls.Add(t); head.Controls.Add(s);
        head.Paint += (o, e) => e.Graphics.DrawLine(new Pen(Color.FromArgb(225, 228, 232)), 0, head.Height - 1, head.Width, head.Height - 1);
        return head;
    }
}

class InstallForm : Form
{
    TextBox dirBox;
    CheckBox desktopBox, startBox;
    ProgressBar bar;
    Label status;
    Button installBtn, cancelBtn, browseBtn;
    Panel body;
    bool done, working;
    string installDir;

    public InstallForm()
    {
        Text = "Installation de FREE";
        Icon = Setup.AppIcon();
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(600, 430);
        BackColor = Color.FromArgb(246, 248, 250);
        Font = new Font("Segoe UI", 9.5f);

        body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 16, 24, 0) };
        Controls.Add(body);
        Controls.Add(Setup.Header("Installer FREE", "French Reverse Engineer Everything  ·  NetLance  ·  version " + Setup.Version));

        int y = 18;
        var intro = Setup.MakeLabel(
            "FREE va être installé pour votre compte Windows (pas besoin de droits administrateur).\n" +
            "Au premier lancement, FREE vérifie et installe lui-même ce dont il a besoin\n" +
            "(Node.js, Java, Ghidra, REA et Claude Code).", 9.5f, FontStyle.Regular, Setup.Ink);
        intro.Location = new Point(24, y); body.Controls.Add(intro);
        y += 76;

        var dl = Setup.MakeLabel("Dossier d'installation :", 9.5f, FontStyle.Bold, Setup.Ink);
        dl.Location = new Point(24, y); body.Controls.Add(dl);
        y += 26;
        dirBox = new TextBox { Text = Setup.DefaultDir(), Location = new Point(26, y), Width = 430 };
        browseBtn = new Button { Text = "Parcourir…", Location = new Point(466, y - 2), Size = new Size(108, 28), FlatStyle = FlatStyle.System };
        browseBtn.Click += (s, e) =>
        {
            using (var fb = new FolderBrowserDialog { Description = "Choisissez où installer FREE (un sous-dossier FREE sera utilisé).", ShowNewFolderButton = true })
            {
                if (fb.ShowDialog(this) == DialogResult.OK)
                {
                    string p = fb.SelectedPath;
                    if (!string.Equals(Path.GetFileName(p), "FREE", StringComparison.OrdinalIgnoreCase)) p = Path.Combine(p, "FREE");
                    dirBox.Text = p;
                }
            }
        };
        body.Controls.Add(dirBox); body.Controls.Add(browseBtn);
        y += 44;

        desktopBox = new CheckBox { Text = "Créer un raccourci sur le Bureau", Checked = true, AutoSize = true, Location = new Point(26, y) };
        body.Controls.Add(desktopBox);
        y += 28;
        startBox = new CheckBox { Text = "Lancer FREE à la fin de l'installation", Checked = true, AutoSize = true, Location = new Point(26, y) };
        body.Controls.Add(startBox);
        y += 40;

        bar = new ProgressBar { Location = new Point(26, y), Width = 548, Height = 14, Visible = false };
        body.Controls.Add(bar);
        y += 22;
        status = Setup.MakeLabel("", 9f, FontStyle.Regular, Setup.Muted);
        status.Location = new Point(24, y); body.Controls.Add(status);

        installBtn = new Button { Text = "Installer", Size = new Size(120, 34), Location = new Point(454, 372), BackColor = Setup.Blue, ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 10f, FontStyle.Bold) };
        installBtn.FlatAppearance.BorderSize = 0;
        cancelBtn = new Button { Text = "Annuler", Size = new Size(100, 34), Location = new Point(344, 372), FlatStyle = FlatStyle.System };
        Controls.Add(installBtn); Controls.Add(cancelBtn);
        installBtn.BringToFront(); cancelBtn.BringToFront();
        installBtn.Click += (s, e) => { if (done) Finish(); else StartInstall(); };
        cancelBtn.Click += (s, e) => Close();
        AcceptButton = installBtn;
        Shown += (s, e) => { dirBox.SelectionLength = 0; installBtn.Focus(); };
        FormClosing += (s, e) => { if (working) e.Cancel = true; };
    }

    void SetStatus(string text) { BeginInvoke((Action)(() => status.Text = text)); }
    void SetProgress(int v) { BeginInvoke((Action)(() => bar.Value = Math.Max(0, Math.Min(100, v)))); }

    void StartInstall()
    {
        string dir = dirBox.Text.Trim().TrimEnd(new char[] { '\\' });
        if (dir.Length < 4 || !Path.IsPathRooted(dir)) { MessageBox.Show(this, "Choisissez un dossier d'installation valide.", "FREE", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        string winDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        if (dir.StartsWith(winDir, StringComparison.OrdinalIgnoreCase)) { MessageBox.Show(this, "Impossible d'installer dans le dossier Windows.", "FREE", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (dir.IndexOf("OneDrive", StringComparison.OrdinalIgnoreCase) >= 0 &&
            MessageBox.Show(this, "Ce dossier est synchronisé par OneDrive, ce qui peut ralentir FREE et bloquer certains fichiers.\n\nInstaller quand même ici ?", "FREE", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        if (Setup.FreeRunning() &&
            MessageBox.Show(this, "FREE est en cours d'utilisation.\n\nIl va être fermé proprement (votre travail est sauvegardé) pour pouvoir le mettre à jour. Continuer ?", "FREE", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) != DialogResult.OK) return;

        installDir = dir;
        working = true;
        installBtn.Enabled = cancelBtn.Enabled = browseBtn.Enabled = dirBox.Enabled = desktopBox.Enabled = false;
        bar.Visible = true;
        bool desktop = desktopBox.Checked;
        var th = new Thread(() =>
        {
            string err = null;
            try { DoInstall(dir, desktop); }
            catch (Exception ex) { err = ex.Message; }
            BeginInvoke((Action)(() => Installed(err)));
        });
        th.IsBackground = true;
        th.Start();
    }

    void DoInstall(string dir, bool desktop) { Installer.Install(dir, desktop, SetStatus, SetProgress); }

    void Installed(string err)
    {
        working = false;
        if (err != null)
        {
            status.Text = "L'installation a échoué.";
            MessageBox.Show(this, "L'installation a échoué :\n\n" + err, "FREE", MessageBoxButtons.OK, MessageBoxIcon.Error);
            installBtn.Enabled = cancelBtn.Enabled = browseBtn.Enabled = dirBox.Enabled = desktopBox.Enabled = true;
            return;
        }
        done = true;
        body.Controls.Clear();
        var ok = Setup.MakeLabel("✔  FREE est installé !", 15f, FontStyle.Bold, Color.FromArgb(26, 127, 55));
        ok.Location = new Point(24, 24); body.Controls.Add(ok);
        var info = Setup.MakeLabel(
            "Vous le trouverez dans le menu Démarrer" + (desktopBox.Checked ? " et sur le Bureau" : "") + ".\n\n" +
            "Au premier lancement, FREE installe ce qui manque (Node.js, Java, Ghidra,\n" +
            "REA, Claude Code) puis vous aide à connecter votre compte Claude.\n" +
            "Cela peut prendre quelques minutes : laissez les fenêtres se terminer.\n\n" +
            "Pour le désinstaller : Paramètres Windows > Applications > FREE.",
            9.5f, FontStyle.Regular, Setup.Ink);
        info.Location = new Point(26, 70); body.Controls.Add(info);
        startBox.Location = new Point(26, 236); startBox.Enabled = true; body.Controls.Add(startBox);
        installBtn.Text = "Terminer"; installBtn.Enabled = true;
        cancelBtn.Visible = false;
    }

    void Finish()
    {
        if (startBox.Checked)
        {
            try { Process.Start(new ProcessStartInfo(Path.Combine(installDir, "FREE.exe")) { WorkingDirectory = installDir, UseShellExecute = true }); }
            catch (Exception ex) { MessageBox.Show(this, "Impossible de lancer FREE : " + ex.Message, "FREE"); }
        }
        Close();
    }
}

static class Installer
{
    public static void Install(string dir, bool desktop, Action<string> SetStatus, Action<int> SetProgress)
    {
        Setup.StopFree(SetStatus);

        SetStatus("Préparation du dossier…");
        Directory.CreateDirectory(dir);
        // Mise a jour : on remplace le code de l'application pour ne pas garder d'anciens fichiers.
        Setup.DeleteDir(Path.Combine(dir, "ressources\\app"));
        Setup.DeleteDir(Path.Combine(dir, "ressources\\installation"));

        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
        {
            int n = zip.Entries.Count, i = 0;
            string root = Path.GetFullPath(dir + "\\");
            foreach (var entry in zip.Entries)
            {
                i++;
                string target = Path.GetFullPath(Path.Combine(dir, entry.FullName.Replace('/', '\\')));
                if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;
                if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                if (i % 10 == 0 || i == n) { SetStatus("Copie des fichiers… " + i + " / " + n); SetProgress(i * 85 / n); }
                for (int attempt = 0; ; attempt++)
                {
                    try
                    {
                        if (File.Exists(target)) File.SetAttributes(target, FileAttributes.Normal);
                        using (var src = entry.Open())
                        using (var dst = File.Create(target)) src.CopyTo(dst);
                        break;
                    }
                    catch (IOException)
                    {
                        if (attempt >= 5) throw new IOException("Impossible d'écrire " + entry.FullName + " (fichier utilisé ?). Fermez FREE et réessayez.");
                        Thread.Sleep(1000);
                    }
                }
            }
        }

        SetStatus("Création des raccourcis…"); SetProgress(90);
        File.WriteAllText(Path.Combine(dir, "ressources\\installe.txt"),
            "FREE a été installé ici par FREE-Installation.exe le " + DateTime.Now + ".\r\nLes raccourcis sont gérés par l'installateur.\r\n");
        string self = Application.ExecutablePath;
        string uninst = Path.Combine(dir, Setup.UninstExe);
        if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(uninst), StringComparison.OrdinalIgnoreCase))
            File.Copy(self, uninst, true);

        string exe = Path.Combine(dir, "FREE.exe");
        try { Setup.MakeShortcut(Setup.StartMenuLnk, exe, dir); } catch { }
        if (desktop) { try { Setup.MakeShortcut(Setup.DesktopLnk, exe, dir); } catch { } }
        else Setup.TryDelete(Setup.DesktopLnk);

        SetStatus("Enregistrement dans Windows (Paramètres > Applications)…"); SetProgress(96);
        using (var k = Registry.CurrentUser.CreateSubKey(Setup.UninstKey))
        {
            k.SetValue("DisplayName", "FREE - French Reverse Engineer Everything");
            k.SetValue("DisplayVersion", Setup.Version);
            k.SetValue("Publisher", "NetLance");
            k.SetValue("DisplayIcon", exe + ",0");
            k.SetValue("InstallLocation", dir);
            k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
            k.SetValue("UninstallString", "\"" + uninst + "\" /uninstall");
            k.SetValue("QuietUninstallString", "\"" + uninst + "\" /uninstall");
            k.SetValue("EstimatedSize", (int)Setup.DirSizeKb(dir), RegistryValueKind.DWord);
            k.SetValue("NoModify", 1, RegistryValueKind.DWord);
            k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
        SetProgress(100);
    }

    // Mise a jour automatique lancee par FREE (/maj) : pas de questions, on garde le dossier et les choix d'avant.
    public static void Update()
    {
        string dir = Setup.DefaultDir();
        bool desktop = File.Exists(Setup.DesktopLnk);
        string err = null;
        using (var f = new ProgressForm("Mise à jour de FREE"))
        {
            f.Show();
            f.Status("Mise à jour vers la version " + Setup.Version + "…");
            var th = new Thread(() =>
            {
                try { Install(dir, desktop, s => f.BeginInvoke((Action)(() => f.Status("Version " + Setup.Version + " : " + s))), p => { }); }
                catch (Exception ex) { err = ex.Message; }
            });
            th.IsBackground = true; th.Start();
            while (th.IsAlive) { Application.DoEvents(); Thread.Sleep(50); }
            f.Close();
        }
        if (err != null)
        {
            MessageBox.Show("La mise à jour de FREE a échoué :\n\n" + err + "\n\nVous pouvez relancer FREE : l'ancienne version fonctionne toujours, ou réinstaller avec FREE-Installation.exe.", "FREE", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        else
        {
            try { Process.Start(new ProcessStartInfo(Path.Combine(dir, "FREE.exe")) { WorkingDirectory = dir, UseShellExecute = true }); } catch { }
        }
        Uninstaller.SelfDelete();
    }
}

static class Uninstaller
{
    public static void Run(string[] args)
    {
        string dir = null;
        bool fromTemp = false;
        for (int i = 1; i < args.Length; i++)
        {
            if (string.Equals(args[i], "/temp", StringComparison.OrdinalIgnoreCase)) fromTemp = true;
            else dir = args[i];
        }
        if (dir == null) dir = Path.GetDirectoryName(Application.ExecutablePath);

        // Le desinstallateur est dans le dossier a supprimer : on se relance depuis une copie temporaire.
        if (!fromTemp)
        {
            string tmp = Path.Combine(Path.GetTempPath(), "FREE-desinstallation-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
            File.Copy(Application.ExecutablePath, tmp, true);
            Process.Start(new ProcessStartInfo(tmp, "/uninstall \"" + dir + "\" /temp") { UseShellExecute = false, WorkingDirectory = Path.GetTempPath() });
            return;
        }

        if (MessageBox.Show("Voulez-vous désinstaller FREE ?\n\nDossier : " + dir, "Désinstaller FREE",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) { SelfDelete(); return; }

        string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FREE");
        string projects = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "REA-Projets");
        var wipeData = MessageBox.Show(
            "Supprimer aussi l'historique des analyses et les réglages de FREE ?\n\n" + data + "\n\n" +
            "Oui = tout effacer   ·   Non = les garder (utile si vous réinstallez FREE)\n\n" +
            "Vos projets reconstruits (" + projects + ") ne sont jamais supprimés.",
            "Désinstaller FREE", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;

        using (var f = new ProgressForm())
        {
            f.Show();
            Action<string> st = s => { f.Status(s); Application.DoEvents(); };
            Setup.StopFree(st);
            st("Suppression des raccourcis…");
            Setup.TryDelete(Setup.StartMenuLnk);
            if (IsOurShortcut(Setup.DesktopLnk, dir)) Setup.TryDelete(Setup.DesktopLnk);
            st("Suppression des fichiers de FREE…");
            if (LooksLikeFree(dir)) Setup.DeleteDir(dir);
            if (wipeData) { st("Suppression des analyses et réglages…"); Setup.DeleteDir(data); }
            else Setup.DeleteDir(Path.Combine(data, "app")); // la copie du code est recreee au prochain lancement
            try { Registry.CurrentUser.DeleteSubKeyTree(Setup.UninstKey); } catch { }
            f.Close();
        }

        string left = Directory.Exists(dir) ? "\n\nCertains fichiers n'ont pas pu être supprimés :\n" + dir : "";
        MessageBox.Show("FREE a été désinstallé." + left + "\n\n" +
            "Les outils installés pour lui (Node.js, Java, Ghidra, REA, Claude Code) sont conservés : " +
            "vous pouvez les retirer depuis Paramètres > Applications si vous n'en avez plus besoin.",
            "FREE", MessageBoxButtons.OK, MessageBoxIcon.Information);
        SelfDelete();
    }

    // Securite : on ne supprime le dossier que s'il contient bien FREE.
    static bool LooksLikeFree(string dir)
    {
        if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return false;
        string full = Path.GetFullPath(dir).TrimEnd(new char[] { '\\' });
        if (full.Length <= 3) return false; // jamais une racine de disque
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile).TrimEnd(new char[] { '\\' });
        if (string.Equals(full, home, StringComparison.OrdinalIgnoreCase)) return false;
        return File.Exists(Path.Combine(full, "FREE.exe")) && Directory.Exists(Path.Combine(full, "ressources"));
    }

    static bool IsOurShortcut(string lnk, string dir)
    {
        if (!File.Exists(lnk)) return false;
        try
        {
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(t);
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
            string target = (string)sc.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, sc, null);
            return target != null && target.StartsWith(dir, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    public static void SelfDelete()
    {
        try
        {
            Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 > nul & del /f /q \"" + Application.ExecutablePath + "\"")
            { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden });
        }
        catch { }
    }
}

class ProgressForm : Form
{
    Label label;
    public ProgressForm() : this("Désinstallation de FREE") { }
    public ProgressForm(string title)
    {
        Text = title;
        Icon = Setup.AppIcon();
        FormBorderStyle = FormBorderStyle.FixedDialog; ControlBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(480, 120);
        BackColor = Color.White; Font = new Font("Segoe UI", 9.5f);
        label = Setup.MakeLabel("Patientez…", 10f, FontStyle.Regular, Setup.Ink);
        label.Location = new Point(20, 24);
        Controls.Add(label);
        Controls.Add(new ProgressBar { Style = ProgressBarStyle.Marquee, Location = new Point(22, 66), Width = 376, Height = 14, MarqueeAnimationSpeed = 30 });
    }
    public void Status(string s) { label.Text = s; }
}
