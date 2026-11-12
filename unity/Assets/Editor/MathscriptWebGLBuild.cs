using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class MathscriptWebGLBuild
{
    public static void Build()
    {
        string outputDirectory = Environment.GetEnvironmentVariable("MATHSCRIPT_WEBGL_OUTPUT");
        if (string.IsNullOrWhiteSpace(outputDirectory))
            throw new Exception("Set MATHSCRIPT_WEBGL_OUTPUT to the web app's public/unity-build directory.");

        const string scenePath = "Assets/Scenes/MathscriptIdleMiner.unity";
        if (!File.Exists(scenePath))
            throw new Exception("The configured Unity Tycoon scene is missing: " + scenePath);

        Directory.CreateDirectory(outputDirectory);
    PlayerSettings.colorSpace = ColorSpace.Linear;
        MathscriptParityChecks.Run();
        MathscriptIdleLoopChecks.Run();
        MathscriptContractChecks.Run();
        Mathscript3DOnlyChecks.Run();
        MathscriptHeroChecks.Run();
        MathscriptRealismChecks.Run();
        PlayerSettings.WebGL.compressionFormat = Environment.GetEnvironmentVariable("MATHSCRIPT_WEBGL_UNCOMPRESSED") == "1"
            ? WebGLCompressionFormat.Disabled : WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.template = "PROJECT:Mathscript";

        BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { scenePath },
            locationPathName = Path.GetFullPath(outputDirectory),
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        });

        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("Mathscript WebGL build failed: " + report.summary.result);

        Debug.Log("MATHSCRIPT_WEBGL_BUILD_PASS " + report.summary.totalSize + " bytes");
    }
}