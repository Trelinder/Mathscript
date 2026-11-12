using System;
using UnityEditor;
using UnityEngine;

public sealed class MathscriptSurfaceImport : AssetPostprocessor
{
    private void OnPreprocessTexture()
    {
        if (assetPath.StartsWith("Assets/Resources/Surfaces/", StringComparison.Ordinal)) Configure((TextureImporter)assetImporter);
    }

    private static void Configure(TextureImporter importer)
    {
        bool normal = importer.assetPath.EndsWith("/normal.jpg", StringComparison.Ordinal);
        importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
        importer.sRGBTexture = !normal;
        importer.maxTextureSize = 1024;
        importer.mipmapEnabled = true;
        importer.wrapMode = TextureWrapMode.Repeat;
        importer.filterMode = FilterMode.Trilinear;
        importer.anisoLevel = 2;
        importer.textureCompression = TextureImporterCompression.Compressed;
    }

    public static void EnsureTextures()
    {
        const string foliagePath = "Assets/Resources/Surfaces/NeedleCutout.mat";
        var foliage = AssetDatabase.LoadAssetAtPath<Material>(foliagePath);
        if (foliage == null)
        {
            foliage = new Material(Shader.Find("Standard")) { name = "NeedleCutout", enableInstancing = true };
            foliage.SetFloat("_Mode", 1);
            foliage.SetFloat("_Cutoff", 0.38f);
            foliage.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.One);
            foliage.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.Zero);
            foliage.SetInt("_ZWrite", 1);
            foliage.EnableKeyword("_ALPHATEST_ON");
            foliage.SetOverrideTag("RenderType", "TransparentCutout");
            foliage.renderQueue = (int)UnityEngine.Rendering.RenderQueue.AlphaTest;
            AssetDatabase.CreateAsset(foliage, foliagePath);
            AssetDatabase.SaveAssets();
        }
        foreach (string guid in AssetDatabase.FindAssets("t:Texture2D", new[] { "Assets/Resources/Surfaces" }))
        {
            var importer = (TextureImporter)AssetImporter.GetAtPath(AssetDatabase.GUIDToAssetPath(guid));
            bool normal = importer.assetPath.EndsWith("/normal.jpg", StringComparison.Ordinal);
            if (importer.textureType == (normal ? TextureImporterType.NormalMap : TextureImporterType.Default) && importer.maxTextureSize == 1024 && importer.mipmapEnabled && importer.sRGBTexture != normal) continue;
            Configure(importer);
            importer.SaveAndReimport();
        }
    }
}