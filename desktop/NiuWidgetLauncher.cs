using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace NiuWidgetLauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string stopper = Path.Combine(baseDir, "Stop-OldWidgets.ps1");
                string widget = Path.Combine(baseDir, "NiuWidget.ps1");
                string electron = Path.Combine(baseDir, "node_modules", "electron", "dist", "electron.exe");
                string builtIndex = Path.Combine(baseDir, "dist", "index.html");

                RunPowerShell(stopper, true);

                if (File.Exists(electron) && File.Exists(builtIndex))
                {
                    RunElectron(electron, baseDir);
                }
                else
                {
                    RunPowerShell(widget, false);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.ToString(), "Niu Widget Launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void RunPowerShell(string scriptPath, bool wait)
        {
            string ps = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            if (!File.Exists(ps)) ps = "powershell.exe";

            var startInfo = new ProcessStartInfo
            {
                FileName = ps,
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            string windowsDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (string.IsNullOrEmpty(windowsDir)) windowsDir = @"C:\Windows";
            if (!startInfo.EnvironmentVariables.ContainsKey("WINDIR") || string.IsNullOrEmpty(startInfo.EnvironmentVariables["WINDIR"]))
                startInfo.EnvironmentVariables["WINDIR"] = windowsDir;
            if (!startInfo.EnvironmentVariables.ContainsKey("SystemRoot") || string.IsNullOrEmpty(startInfo.EnvironmentVariables["SystemRoot"]))
                startInfo.EnvironmentVariables["SystemRoot"] = windowsDir;

            Process process = Process.Start(startInfo);
            if (wait && process != null) process.WaitForExit();
        }

        private static void RunElectron(string electronPath, string appDir)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = electronPath,
                Arguments = "\"" + appDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            string windowsDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (string.IsNullOrEmpty(windowsDir)) windowsDir = @"C:\Windows";
            if (!startInfo.EnvironmentVariables.ContainsKey("WINDIR") || string.IsNullOrEmpty(startInfo.EnvironmentVariables["WINDIR"]))
                startInfo.EnvironmentVariables["WINDIR"] = windowsDir;
            if (!startInfo.EnvironmentVariables.ContainsKey("SystemRoot") || string.IsNullOrEmpty(startInfo.EnvironmentVariables["SystemRoot"]))
                startInfo.EnvironmentVariables["SystemRoot"] = windowsDir;

            Process.Start(startInfo);
        }
    }
}
