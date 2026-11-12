using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using MathscriptPrototype;

public static class MathscriptSpriteBuild
{
    public static void Generate()
    {
        const int layer = 31;
        const int size = 256;
        string directory = Path.Combine(Application.dataPath, "Resources/Tycoon/Crew");
        Directory.CreateDirectory(directory);
        var stage = new GameObject("Original rig sprite capture");
        var target = new RenderTexture(size, size, 24, RenderTextureFormat.ARGB32);
        var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
        var previous = RenderTexture.active;
        try
        {
            var camera = new GameObject("Sprite camera").AddComponent<Camera>();
            camera.transform.SetParent(stage.transform);
            camera.transform.position = new Vector3(0, 0.72f, -5);
            camera.transform.LookAt(new Vector3(0, 0.72f, 0));
            camera.orthographic = true;
            camera.orthographicSize = 0.82f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = Color.clear;
            camera.cullingMask = 1 << layer;
            camera.allowHDR = false;
            camera.allowMSAA = false;
            camera.targetTexture = target;
            var light = new GameObject("Sprite key").AddComponent<Light>();
            light.transform.SetParent(stage.transform);
            light.type = LightType.Directional;
            light.cullingMask = 1 << layer;
            light.intensity = 1.4f;
            light.transform.rotation = Quaternion.Euler(25, -30, 0);
            Color32[] colors = { new Color32(168,85,247,255), new Color32(249,115,22,255),
                new Color32(236,72,153,255), new Color32(245,158,11,255), new Color32(34,197,94,255),
                new Color32(59,130,246,255), new Color32(0,200,255,255) };
            int count = 0;
            for (int uniform = 0; uniform < 8; uniform++)
            {
                bool manager = uniform == 7;
                var actor = new GameObject(manager ? "Manager" : "Crew");
                actor.transform.SetParent(stage.transform);
                var rig = actor.AddComponent<MathscriptWorker>();
                rig.Initialize(Shader.Find("Standard"), colors[manager ? 0 : uniform], manager ? 0 : uniform, manager);
                foreach (var child in actor.GetComponentsInChildren<Transform>(true)) child.gameObject.layer = layer;
                foreach (MathscriptWorker.Motion motion in Enum.GetValues(typeof(MathscriptWorker.Motion)))
                {
                    if (manager && motion != MathscriptWorker.Motion.Idle) continue;
                    for (int frame = 0; frame < 4; frame++)
                    {
                        rig.Pose(motion, frame * Mathf.PI / 12);
                        camera.Render();
                        RenderTexture.active = target;
                        texture.ReadPixels(new Rect(0, 0, size, size), 0, 0);
                        texture.Apply();
                        int opaque = 0;
                        var pixels = texture.GetPixels32();
                        for (int index = 0; index < pixels.Length; index++)
                        {
                            if (pixels[index].a <= 0) continue;
                            opaque++;
                            int column = index % size;
                            int row = index / size;
                            if (column < 2 || column >= size - 2 || row < 2 || row >= size - 2)
                                throw new InvalidOperationException("Sprite capture clipped: " + actor.name + " / " + motion);
                        }
                        if (opaque < 500 || opaque > size * size / 2) throw new InvalidOperationException("Sprite alpha coverage invalid");
                        string name = manager ? "manager" : "crew-" + uniform;
                        string path = "Assets/Resources/Tycoon/Crew/" + name + "-" + motion.ToString().ToLowerInvariant() + "-" + frame + ".png";
                        File.WriteAllBytes(path, texture.EncodeToPNG());
                        AssetDatabase.ImportAsset(path);
                        var importer = (TextureImporter)AssetImporter.GetAtPath(path);
                        importer.textureType = TextureImporterType.Default;
                        importer.alphaIsTransparency = true;
                        importer.mipmapEnabled = false;
                        importer.textureCompression = TextureImporterCompression.Uncompressed;
                        importer.SaveAndReimport();
                        count++;
                    }
                }
                UnityEngine.Object.DestroyImmediate(actor);
            }
            Debug.Log("MATHSCRIPT_SPRITES_PASS frames=" + count);
        }
        finally
        {
            RenderTexture.active = previous;
            UnityEngine.Object.DestroyImmediate(stage);
            target.Release();
            UnityEngine.Object.DestroyImmediate(target);
            UnityEngine.Object.DestroyImmediate(texture);
        }
    }
}