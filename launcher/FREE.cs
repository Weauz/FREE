// FREE.exe - lanceur de FREE (French Reverse Engineer Everything)
// - verifie les composants (Node.js, REA, Ghidra) et lance l'installation si besoin ;
// - prepare l'appli dans %LOCALAPPDATA%\FREE\app (hors OneDrive) ;
// - demarre le serveur local sans fenetre noire et ouvre le navigateur ;
// - icone pres de l'horloge : ouvrir FREE, voir les projets, quitter en sauvegardant.
// Code volontairement simple et lisible : pas de compression, pas de technique cachee.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.IO.Compression;

[assembly: AssemblyTitle("FREE - French Reverse Engineer Everything")]
[assembly: AssemblyDescription("Interface locale pour REA et Claude Code")]
[assembly: AssemblyProduct("FREE")]
[assembly: AssemblyCompany("NetLance")]
[assembly: AssemblyCopyright("© 2026 NetLance")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

static class FreeLauncher
{
    const string Url = "http://localhost:4747";
    // Pour les appels internes : adresse IPv4 directe et sans proxy ("localhost" peut d'abord tenter IPv6 et echouer).
    const string Api = "http://127.0.0.1:4747";
    static string ExeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(new char[] { '\\' });
    static string Base = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FREE");
    static string AppDir = Path.Combine(Base, "app");
    static string LogFile = Path.Combine(Base, "free.log");
    static Process server;
    static NotifyIcon tray;
    static bool quitting;
    // Rangement du dossier : FREE.exe et LISEZ-MOI.txt a la racine, tout le reste dans « ressources ».
    static string Res = Path.Combine(ExeDir, "ressources");
    static string TraceFile = Path.Combine(Directory.Exists(Path.Combine(ExeDir, "ressources")) ? Path.Combine(ExeDir, "ressources") : ExeDir, "journal.txt");
    static string AppSource { get { string p = Path.Combine(Res, "app"); return Directory.Exists(p) ? p : Path.Combine(ExeDir, "free"); } }
    static string InstallerScript { get { string p = Path.Combine(Res, "installation", "installer-rea.ps1"); return File.Exists(p) ? p : Path.Combine(ExeDir, "Installation", "installer-rea.ps1"); } }

    // Journal de demarrage, a cote de FREE.exe (utile pour comprendre un probleme)
    static void Trace(string msg)
    {
        try { File.AppendAllText(TraceFile, DateTime.Now.ToString("HH:mm:ss") + "  " + msg + "\r\n"); } catch { }
    }

    static DialogResult Box(string text, MessageBoxButtons b, MessageBoxIcon i)
    {
        using (var owner = new Form { TopMost = true, ShowInTaskbar = false, StartPosition = FormStartPosition.CenterScreen, Width = 1, Height = 1, Opacity = 0 })
        {
            owner.Show(); owner.Activate();
            return MessageBox.Show(owner, text, "FREE", b, i);
        }
    }

    [STAThread]
    static void Main()
    {
        try { File.WriteAllText(TraceFile, "Journal de FREE.exe - " + DateTime.Now + "\r\n"); } catch { }
        AppDomain.CurrentDomain.UnhandledException += (s, e) => { Trace("ERREUR FATALE : " + e.ExceptionObject); };
        Application.ThreadException += (s, e) => { Trace("ERREUR : " + e.Exception); Box("Erreur dans FREE :\n\n" + e.Exception.Message, MessageBoxButtons.OK, MessageBoxIcon.Error); };
        Trace("Démarrage. Dossier : " + ExeDir + " | .NET " + Environment.Version + " | Windows " + Environment.OSVersion.Version);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool first;
        using (var mutex = new Mutex(true, "FREE-French-Reverse-Engineer-Everything", out first))
        {
            if (!first) { Trace("Une autre fenêtre FREE.exe tourne déjà : ouverture de la page."); OpenBrowser(); return; }
            if (ServerUp())
            {
                // Serveur reste d'un ancien lancement (sans icone) : on l'arrete proprement pour repartir sur une version a jour.
                Trace("Un ancien serveur FREE tourne encore sans icône : arrêt propre puis redémarrage.");
                using (var splash = Splash("Redémarrage de FREE…"))
                {
                    PostQuit();
                    for (int i = 0; i < 60 && ServerUp(); i++) { Thread.Sleep(500); Application.DoEvents(); }
                }
                if (ServerUp()) { Trace("L'ancien serveur ne s'arrête pas : ouverture de la fenêtre."); OpenBrowser(); return; }
            }
            try { Run(); }
            catch (Exception ex)
            {
                Trace("ERREUR : " + ex);
                Box("FREE n'a pas pu démarrer :\n\n" + ex.Message + "\n\nDétails : ressources\\journal.txt (dans le dossier de FREE)", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            Trace("Fin de FREE.exe.");
        }
    }

    static void Run()
    {
        Directory.CreateDirectory(Base);
        RefreshEnvironment();

        // 1. Composants : Node.js, REA, Ghidra/Java. S'il en manque, installation guidee.
        string missing = MissingComponents();
        Trace("Composants manquants : " + (missing == null ? "aucun" : missing.Replace("\n", " ")));
        if (missing != null)
        {
            var r = Box(
                "Bienvenue dans FREE !\n\nAvant la première utilisation, FREE doit installer ce qui lui manque :\n" + missing +
                "\n\nUne fenêtre va s'ouvrir et vous guider (5 à 15 minutes, connexion Internet nécessaire). Répondez O (oui) aux questions.\n\nLancer l'installation maintenant ?",
                MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (r != DialogResult.Yes) return;
            RunInstaller(true);
            RefreshEnvironment();
            missing = MissingComponents();
            if (missing != null)
            {
                Box("Il manque encore :\n" + missing + "\n\nRelancez FREE pour reprendre l'installation. Le rapport est dans ressources\\installation-rapport.txt.",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
        }

        // 2. Preparation de l'appli (copie hors OneDrive + dependances la premiere fois)
        string src = AppSource;
        if (!File.Exists(Path.Combine(src, "server.js"))) throw new Exception("Le dossier « ressources » est introuvable à côté de FREE.exe. Gardez FREE.exe dans son dossier d'origine.");
        int rc = Exec("robocopy.exe", Q(src) + " " + Q(AppDir) + " /MIR /XD node_modules /NFL /NDL /NJH /NJS /NP", Base, 120000);
        Trace("Copie de l'appli vers " + AppDir + " : code " + rc + (rc < 8 ? " (OK)" : " (ÉCHEC)"));
        if (!Directory.Exists(Path.Combine(AppDir, "node_modules", "@modelcontextprotocol", "sdk")))
        {
            using (var splash = Splash("Préparation de FREE (première fois, environ une minute)…"))
            {
                int code = Exec("cmd.exe", "/c npm install --omit=dev --no-audit --no-fund", AppDir, 600000);
                if (code != 0) throw new Exception("L'installation des dépendances de FREE (npm install) a échoué. Vérifiez votre connexion Internet.");
            }
        }

        // 3. Raccourci sur le Bureau (cree ou mis a jour si le dossier a bouge)
        try { UpdateShortcut(); } catch { }

        // 4. Serveur sans fenetre
        StartServer();
        Trace("Serveur lancé (node " + Which("node.exe") + ", processus " + server.Id + ").");

        // 5. Icone pres de l'horloge
        tray = new NotifyIcon();
        try { tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { tray.Icon = SystemIcons.Application; }
        tray.Text = "FREE - French Reverse Engineer Everything";
        var menu = new ContextMenuStrip();
        menu.Items.Add("Ouvrir la fenêtre FREE", null, (s, e) => OpenBrowser());
        menu.Items.Add("Ouvrir le dossier des projets", null, (s, e) => OpenFolder(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "REA-Projets")));
        menu.Items.Add("Voir le journal", null, (s, e) => { if (File.Exists(LogFile)) Process.Start("notepad.exe", Q(LogFile)); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quitter FREE (en sauvegardant)", null, (s, e) => Quit());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (s, e) => OpenBrowser();
        tray.Visible = true;
        Trace("Icône affichée près de l'horloge.");
        using (var splash = Splash("Démarrage de FREE…"))
        {
            if (WaitServer(60)) Trace("Serveur prêt.");
            else Trace("Le serveur ne répond pas après 60 s (voir free.log). Ouverture de la fenêtre quand même.");
        }
        OpenBrowser();
        SystemEvents.SessionEnding += (s, e) => Quit();

        // Surveillance du serveur (sur le fil de l'interface) : arret normal = on ferme aussi l'icone.
        var watch = new System.Windows.Forms.Timer { Interval = 1000 };
        watch.Tick += (s, e) =>
        {
            if (quitting) return;
            // La fenetre FREE a ete vue puis a disparu : l'utilisateur l'a fermee
            bool open = false;
            if (appForm == null) { try { open = FindFreeWindows().Count > 0; } catch { } }
            if (open) windowSeen = true;
            if (windowSeen && !open)
            {
                windowSeen = false;
                string busy = GetBusy();
                if (busy == null) { Trace("Fenêtre fermée : arrêt de FREE."); Quit(); return; }
                Trace("Fenêtre fermée pendant un travail : FREE continue en arrière-plan.");
                tray.ShowBalloonTip(8000, "FREE continue en arrière-plan", "Une analyse ou Claude Code travaille encore. Double-cliquez sur l'icône FREE pour rouvrir la fenêtre, ou clic droit > Quitter.", ToolTipIcon.Info);
            }
            if (server == null || !server.HasExited) return;
            watch.Stop();
            int code = server.ExitCode;
            if (code != 0)
            {
                Trace("Le serveur s'est arrêté (code " + code + "). Fin du journal du serveur :\r\n" + Tail(LogFile, 40));
                Box("FREE s'est arrêté de façon inattendue (code " + code + ").\n\nLe journal va s'ouvrir pour comprendre ce qui s'est passé. Relancez FREE.exe ensuite.", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            if (code != 0 && File.Exists(LogFile)) Process.Start("notepad.exe", Q(LogFile));
            quitting = true;
            CloseAppWindow();
            tray.Visible = false; tray.Dispose();
            Application.Exit();
        };
        watch.Start();
        Application.Run();
    }

    // ---------- Composants
    static string MissingComponents()
    {
        var sb = new StringBuilder();
        string node = Which("node.exe");
        if (node == null) sb.AppendLine("  - Node.js");
        string npmRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm", "node_modules");
        if (!File.Exists(Path.Combine(npmRoot, "rea-agents", "package.json"))) sb.AppendLine("  - REA (Reverse Engineer Anything)");
        string g = Environment.GetEnvironmentVariable("GHIDRA_INSTALL_DIR");
        if (string.IsNullOrEmpty(g) || !File.Exists(Path.Combine(g, "Ghidra", "application.properties"))) sb.AppendLine("  - Ghidra");
        string j = Environment.GetEnvironmentVariable("JAVA_HOME");
        if (string.IsNullOrEmpty(j) || !File.Exists(Path.Combine(j, "bin", "java.exe"))) sb.AppendLine("  - Java");
        return sb.Length == 0 ? null : sb.ToString().TrimEnd(new char[] { '\r', '\n', ' ' });
    }

    public static void RunInstaller(bool wait)
    {
        string ps1 = InstallerScript;
        if (!File.Exists(ps1)) throw new Exception("ressources\\installation\\installer-rea.ps1 est introuvable à côté de FREE.exe.");
        var p = Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File " + Q(ps1)) { UseShellExecute = true, WorkingDirectory = ExeDir });
        if (wait && p != null) p.WaitForExit();
    }

    // Recharge PATH et les variables du compte (une installation vient peut-etre de les changer)
    static void RefreshEnvironment()
    {
        string machine = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine) ?? "";
        string user = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User) ?? "";
        Environment.SetEnvironmentVariable("Path", machine + ";" + user);
        foreach (var k in new[] { "GHIDRA_INSTALL_DIR", "JAVA_HOME", "REA_ANALYSIS_PROVIDER", "GHIDRA_HEADLESS_MAXMEM" })
        {
            string v = Environment.GetEnvironmentVariable(k, EnvironmentVariableTarget.User);
            if (!string.IsNullOrEmpty(v)) Environment.SetEnvironmentVariable(k, v);
        }
        Environment.SetEnvironmentVariable("FREE_HOME", ExeDir);
        Environment.SetEnvironmentVariable("FREE_NO_BROWSER", "1");
    }

    static string Which(string exe)
    {
        foreach (var dir in (Environment.GetEnvironmentVariable("Path") ?? "").Split(new char[] { ';' }))
        {
            try { var f = Path.Combine(dir.Trim(), exe); if (dir.Trim().Length > 0 && File.Exists(f)) return f; } catch { }
        }
        return null;
    }

    // ---------- Serveur
    static void StartServer()
    {
        string node = Which("node.exe");
        File.AppendAllText(LogFile, "\r\n===== Démarrage " + DateTime.Now + " =====\r\n");
        var psi = new ProcessStartInfo(node, "server.js")
        {
            WorkingDirectory = AppDir, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
        };
        server = new Process { StartInfo = psi, EnableRaisingEvents = true };
        server.OutputDataReceived += (s, e) => Log(e.Data);
        server.ErrorDataReceived += (s, e) => Log(e.Data);
        server.Start();
        server.BeginOutputReadLine();
        server.BeginErrorReadLine();
    }

    static readonly object logLock = new object();
    static void Log(string line)
    {
        if (line == null) return;
        lock (logLock) { try { File.AppendAllText(LogFile, line + "\r\n"); } catch { } }
    }

    static bool ServerUp()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Api + "/api/updates");
            req.Timeout = 1500; req.Proxy = null;
            using (var res = (HttpWebResponse)req.GetResponse()) return (int)res.StatusCode < 500;
        }
        catch { return false; }
    }

    static void PostQuit()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Api + "/api/save-and-quit");
            req.Method = "POST"; req.ContentType = "application/json"; req.Timeout = 5000; req.Proxy = null;
            var body = Encoding.UTF8.GetBytes("{}");
            req.ContentLength = body.Length;
            using (var st = req.GetRequestStream()) st.Write(body, 0, body.Length);
            req.GetResponse().Close();
        }
        catch { }
    }

    static void Quit()
    {
        if (quitting) return;
        quitting = true;
        if (tray != null) tray.ShowBalloonTip(3000, "FREE", "Sauvegarde puis arrêt de FREE…", ToolTipIcon.Info);
        try { if (appForm != null && !appForm.IsDisposed) appForm.Hide(); } catch { }
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Api + "/api/save-and-quit");
            req.Method = "POST"; req.ContentType = "application/json"; req.Timeout = 5000; req.Proxy = null;
            var body = Encoding.UTF8.GetBytes("{}");
            req.ContentLength = body.Length;
            using (var st = req.GetRequestStream()) st.Write(body, 0, body.Length);
            req.GetResponse().Close();
        }
        catch { }
        try { if (server != null && !server.WaitForExit(30000)) Exec("taskkill.exe", "/PID " + server.Id + " /T /F", Base, 10000); } catch { }
        CloseAppWindow();
        if (tray != null) { tray.Visible = false; tray.Dispose(); }
        Application.Exit();
    }

    // ---------- Utilitaires
    static string Q(string s) { return "\"" + s + "\""; }

    static string Tail(string file, int lines)
    {
        try { var all = File.ReadAllLines(file); int from = Math.Max(0, all.Length - lines); return string.Join("\r\n", all, from, all.Length - from); } catch { return "(journal illisible)"; }
    }

    static int Exec(string file, string args, string cwd, int timeoutMs)
    {
        var p = Process.Start(new ProcessStartInfo(file, args) { WorkingDirectory = cwd, UseShellExecute = false, CreateNoWindow = true });
        if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } return -1; }
        return p.ExitCode;
    }

    // ---------- Fenetre d'application
    // FREE s'ouvre dans sa propre fenetre (Edge en mode « application » : sans onglets ni barre d'adresse),
    // avec un profil dedie. Edge est present sur tous les Windows 10/11 ; sinon Chrome, sinon le navigateur.
    static Process appWindow;
    static DateTime appWindowStart;
    static string WindowProfile = Path.Combine(Base, "fenetre");

    static string FindAppBrowser()
    {
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string lad = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        foreach (var f in new[] {
            Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(lad, "Google", "Chrome", "Application", "chrome.exe") })
            if (File.Exists(f)) return f;
        return null;
    }

    static void OpenBrowser()
    {
        if (appForm != null && !appForm.IsDisposed) { ShowAppForm(); return; }
        if (!webViewFailed && TryWebView2()) return;
        try
        {
            var existing = FindFreeWindows();
            if (existing.Count > 0) { ShowWindow(existing[0], 9 /* SW_RESTORE */); SetForegroundWindow(existing[0]); Trace("Fenêtre FREE remise au premier plan."); return; }
        }
        catch { }
        string b = FindAppBrowser();
        if (b != null)
        {
            try
            {
                // Mode invite : aucune connexion automatique au compte Microsoft, aucune synchronisation.
                // Un ancien profil (cree avant ce mode, et connecte automatiquement par Edge) est supprime une fois.
                string marker = Path.Combine(Base, "fenetre-v2.ok");
                if (!File.Exists(marker))
                {
                    try { if (Directory.Exists(WindowProfile)) Directory.Delete(WindowProfile, true); } catch { }
                    try { File.WriteAllText(marker, "ok"); } catch { }
                }
                Directory.CreateDirectory(WindowProfile);
                var p = Process.Start(new ProcessStartInfo(b, "--app=" + Url + " --user-data-dir=" + Q(WindowProfile) +
                    " --no-first-run --no-default-browser-check --disable-sync --window-size=1440,920" +
                    " --disable-features=Translate,msImplicitSignin,msShowSignInIndicator") { UseShellExecute = false });
                // Si une fenetre FREE est deja ouverte, ce nouveau processus lui passe la main et s'arrete aussitot :
                // on garde alors le suivi de la fenetre deja ouverte.
                if (appWindow == null || appWindow.HasExited) { appWindow = p; appWindowStart = DateTime.Now; }
                Trace("Fenêtre FREE ouverte (" + Path.GetFileName(b) + ").");
                return;
            }
            catch (Exception e) { Trace("Fenêtre d'application impossible : " + e.Message); }
        }
        try { Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true }); Trace("Page ouverte dans le navigateur."); }
        catch (Exception e) { Trace("Ouverture du navigateur impossible : " + e.Message); try { Process.Start("explorer.exe", Url); } catch { } }
    }

    // La fenetre FREE est retrouvee par son titre (celui de la page), quel que soit le processus Edge qui l'affiche.
    const string WindowTitle = "French Reverse Engineer Everything";
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);

    static List<IntPtr> FindFreeWindows()
    {
        var found = new List<IntPtr>();
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            var cls = new StringBuilder(256); GetClassName(h, cls, 256);
            if (!cls.ToString().StartsWith("Chrome_WidgetWin")) return true;
            var t = new StringBuilder(512); GetWindowText(h, t, 512);
            if (t.ToString().Contains(WindowTitle)) found.Add(h);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    static bool windowSeen;

    // ---------- Vraie fenetre FREE (composant WebView2 de Microsoft, deja present dans Windows 10/11)
    // Les 3 fichiers du composant sont telecharges une fois depuis nuget.org (paquet officiel Microsoft.Web.WebView2).
    static Form appForm;
    static bool webViewFailed;
    static string WvDir = Path.Combine(Base, "webview2");

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadLibrary(string path);

    static bool WebView2RuntimeInstalled()
    {
        const string id = @"\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        foreach (var root in new[] { Registry.LocalMachine, Registry.CurrentUser })
            foreach (var sw in new[] { @"SOFTWARE\WOW6432Node", @"SOFTWARE" })
            {
                try
                {
                    using (var k = root.OpenSubKey(sw + id))
                    {
                        var pv = k == null ? null : k.GetValue("pv") as string;
                        if (!string.IsNullOrEmpty(pv) && pv != "0.0.0.0") return true;
                    }
                }
                catch { }
            }
        return false;
    }

    static string Arch()
    {
        string a = (Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "").ToUpperInvariant();
        if (a == "ARM64") return "win-arm64";
        return IntPtr.Size == 8 ? "win-x64" : "win-x86";
    }

    static bool EnsureWebView2Files()
    {
        string core = Path.Combine(WvDir, "Microsoft.Web.WebView2.Core.dll");
        string wf = Path.Combine(WvDir, "Microsoft.Web.WebView2.WinForms.dll");
        string loader = Path.Combine(WvDir, "WebView2Loader.dll");
        if (File.Exists(core) && File.Exists(wf) && File.Exists(loader)) return true;
        Trace("Téléchargement du composant de fenêtre WebView2 (paquet officiel Microsoft, nuget.org)…");
        Directory.CreateDirectory(WvDir);
        string zip = Path.Combine(Base, "webview2.nupkg");
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
        using (var wc = new WebClient()) wc.DownloadFile("https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2", zip);
        string arch = Arch();
        using (var z = ZipFile.OpenRead(zip))
        {
            foreach (var e in z.Entries)
            {
                string n = e.FullName.Replace('\\', '/');
                bool managed = n.StartsWith("lib/net4") && (n.EndsWith("/Microsoft.Web.WebView2.Core.dll") || n.EndsWith("/Microsoft.Web.WebView2.WinForms.dll"));
                bool native = n == "runtimes/" + arch + "/native/WebView2Loader.dll";
                if (managed || native) e.ExtractToFile(Path.Combine(WvDir, e.Name), true);
            }
        }
        try { File.Delete(zip); } catch { }
        return File.Exists(core) && File.Exists(wf) && File.Exists(loader);
    }

    static bool TryWebView2()
    {
        try
        {
            if (!WebView2RuntimeInstalled()) { Trace("WebView2 absent de Windows : fenêtre Edge à la place."); webViewFailed = true; return false; }
            if (!EnsureWebView2Files()) { Trace("Composant WebView2 incomplet : fenêtre Edge à la place."); webViewFailed = true; return false; }
            LoadLibrary(Path.Combine(WvDir, "WebView2Loader.dll"));
            Assembly.LoadFrom(Path.Combine(WvDir, "Microsoft.Web.WebView2.Core.dll"));
            var wfAsm = Assembly.LoadFrom(Path.Combine(WvDir, "Microsoft.Web.WebView2.WinForms.dll"));
            Type wvType = wfAsm.GetType("Microsoft.Web.WebView2.WinForms.WebView2", true);
            Type propsType = wfAsm.GetType("Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties", true);
            var web = (Control)Activator.CreateInstance(wvType);
            var props = Activator.CreateInstance(propsType);
            propsType.GetProperty("UserDataFolder").SetValue(props, Path.Combine(Base, "fenetre-webview2"), null);
            wvType.GetProperty("CreationProperties").SetValue(web, props, null);
            web.Dock = DockStyle.Fill;

            var form = new Form
            {
                Text = "FREE · French Reverse Engineer Everything",
                StartPosition = FormStartPosition.CenterScreen,
                Width = Math.Min(1440, Screen.PrimaryScreen.WorkingArea.Width - 40),
                Height = Math.Min(920, Screen.PrimaryScreen.WorkingArea.Height - 40),
                MinimumSize = new Size(900, 600),
            };
            try { form.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            form.Controls.Add(web);
            form.FormClosing += (s, e) =>
            {
                if (quitting) return;
                string busy = GetBusy();
                if (busy == null) { Trace("Fenêtre fermée : arrêt de FREE."); e.Cancel = true; BeginQuitLater(); return; }
                e.Cancel = true;
                form.Hide();
                Trace("Fenêtre fermée pendant un travail : FREE continue en arrière-plan.");
                tray.ShowBalloonTip(8000, "FREE continue en arrière-plan", "Une analyse ou Claude Code travaille encore. Double-cliquez sur l'icône FREE pour rouvrir la fenêtre, ou clic droit > Quitter.", ToolTipIcon.Info);
            };
            wvType.GetProperty("Source").SetValue(web, new Uri(Url), null);
            appForm = form;
            ShowAppForm();
            Trace("Fenêtre FREE ouverte (WebView2).");
            return true;
        }
        catch (Exception ex)
        {
            Trace("Fenêtre WebView2 impossible (" + ex.GetType().Name + " : " + ex.Message + ") : fenêtre Edge à la place.");
            webViewFailed = true;
            appForm = null;
            return false;
        }
    }

    static void ShowAppForm()
    {
        appForm.Show();
        if (appForm.WindowState == FormWindowState.Minimized) appForm.WindowState = FormWindowState.Normal;
        appForm.TopMost = true; appForm.TopMost = false; // passe au premier plan
        appForm.Activate();
        SetForegroundWindow(appForm.Handle);
    }

    static void BeginQuitLater()
    {
        var t = new System.Windows.Forms.Timer { Interval = 50 };
        t.Tick += (s, e) => { t.Stop(); Quit(); };
        t.Start();
    }

    static void CloseAppWindow()
    {
        try { if (appForm != null && !appForm.IsDisposed) { appForm.Close(); appForm.Dispose(); } } catch { }
        try { foreach (var h in FindFreeWindows()) PostMessage(h, 0x0010 /* WM_CLOSE */, IntPtr.Zero, IntPtr.Zero); } catch { }
    }

    static string GetBusy()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Api + "/api/busy");
            req.Timeout = 3000; req.Proxy = null;
            using (var res = req.GetResponse())
            using (var rd = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
            {
                string json = rd.ReadToEnd();
                return json.Contains("\"busy\":null") ? null : "un travail est en cours";
            }
        }
        catch { return null; }
    }

    static bool WaitServer(int seconds)
    {
        for (int i = 0; i < seconds * 2; i++) { if (ServerUp()) return true; Thread.Sleep(500); Application.DoEvents(); }
        return false;
    }
    static void OpenFolder(string path) { Directory.CreateDirectory(path); Process.Start("explorer.exe", Q(path)); }

    static Form Splash(string text)
    {
        var f = new Form
        {
            Text = "FREE", FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterScreen,
            Width = 440, Height = 140, ControlBox = false, TopMost = true, ShowInTaskbar = true,
        };
        try { f.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        f.Controls.Add(new Label { Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 10f) });
        f.Show();
        Application.DoEvents();
        return f;
    }

    // Raccourci FREE.lnk sur le Bureau, via l'objet COM standard de Windows (WScript.Shell)
    static void UpdateShortcut()
    {
        // Installe par FREE-Installation.exe : c'est l'installateur qui gere les raccourcis (choix de l'utilisateur).
        if (File.Exists(Path.Combine(ExeDir, "ressources\\installe.txt"))) return;
        string lnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "FREE.lnk");
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
        Type st = sc.GetType();
        string current = (string)st.InvokeMember("TargetPath", BindingFlags.GetProperty, null, sc, null);
        if (string.Equals(current, Application.ExecutablePath, StringComparison.OrdinalIgnoreCase)) return;
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { Application.ExecutablePath });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { ExeDir });
        st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "FREE - French Reverse Engineer Everything" });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { Application.ExecutablePath + ",0" });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
    }
}
