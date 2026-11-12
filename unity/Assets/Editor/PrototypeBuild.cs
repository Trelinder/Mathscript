using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using MathscriptPrototype;

public static class PrototypeBuild
{
    public static void BuildIdleMiner()
    {
        BuildIdleMinerPlayer(BuildOptions.Development, "Builds/macOS/Mathscript Idle Tower.app");
    }

    public static void BuildIdleMinerRelease()
    {
        BuildIdleMinerPlayer(BuildOptions.None, "Builds/macOS-Release/Mathscript Idle Tower.app");
    }

    public static void BuildIdleMinerCandidate()
    {
        string[] arguments = Environment.GetCommandLineArgs();
        int index = Array.IndexOf(arguments, "-candidateOutput");
        if (index < 0 || index + 1 >= arguments.Length) throw new Exception("Candidate output path is required.");
        string output = System.IO.Path.GetFullPath(arguments[index + 1]);
        string builds = System.IO.Path.GetFullPath("Builds") + System.IO.Path.DirectorySeparatorChar;
        if (!output.StartsWith(builds + "macOS-Candidate-", StringComparison.Ordinal) || !output.EndsWith(".app", StringComparison.Ordinal) || System.IO.Directory.Exists(output))
            throw new Exception("Candidate must use a new Builds/macOS-Candidate-* application path.");
        BuildIdleMinerPlayer(BuildOptions.None, output, true);
    }

    private static void BuildIdleMinerPlayer(BuildOptions options, string output, bool preserveProject = false)
    {
        PlayerSettings.colorSpace = ColorSpace.Linear;
        MathscriptHeroChecks.Run();
        MathscriptParityChecks.Run();
        MathscriptContractChecks.Run();
        MathscriptRealismChecks.Run();
        if (!preserveProject)
        {
            PlayerSettings.companyName = "MathscriptPrototype";
            PlayerSettings.productName = "Mathscript Idle Tower";
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 800;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.runInBackground = true;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var tower = new GameObject("Mathscript Idle Miner").AddComponent<MathscriptIdleMiner>();
            tower.towerShader = Shader.Find("Standard");
            if (tower.towerShader == null) throw new Exception("Standard shader is unavailable");
            System.IO.Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/MathscriptIdleMiner.unity");
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/MathscriptIdleMiner.unity", true) };
        }
        else if (!System.IO.File.Exists("Assets/Scenes/MathscriptIdleMiner.unity")) throw new Exception("Saved tower scene is required for a candidate build.");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/MathscriptIdleMiner.unity" },
            locationPathName = output,
            target = BuildTarget.StandaloneOSX,
            options = options
        });
        if (report.summary.result != BuildResult.Succeeded) throw new Exception("Idle tower build failed: " + report.summary.result);
        Debug.Log("MATHSCRIPT_IDLE_BUILD_PASS");
    }

    public static void Build()
    {
        PrototypeChecks.Run();
        PlayerSettings.companyName = "MathscriptPrototype";
        PlayerSettings.productName = "Mathscript Unity Tycoon Prototype";
        PlayerSettings.defaultScreenWidth = 1100;
        PlayerSettings.defaultScreenHeight = 700;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
        PlayerSettings.runInBackground = false;
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var prototype = new GameObject("Tycoon Prototype").AddComponent<TycoonPrototype>();
        prototype.factoryShader = Shader.Find("Standard");
        if (prototype.factoryShader == null) throw new Exception("Standard shader is unavailable");
        System.IO.Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Prototype.unity");
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Prototype.unity", true) };
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Prototype.unity" },
            locationPathName = "Builds/macOS/Mathscript Tycoon.app",
            target = BuildTarget.StandaloneOSX,
            options = BuildOptions.Development
        });
        if (report.summary.result != BuildResult.Succeeded) throw new Exception("Prototype build failed: " + report.summary.result);
        Debug.Log("MATHSCRIPT_BUILD_PASS");
    }
}