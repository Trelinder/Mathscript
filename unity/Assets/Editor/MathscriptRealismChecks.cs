using System;
using MathscriptPrototype;
using UnityEngine;

public static class MathscriptRealismChecks
{
    public static void Run()
    {
        MathscriptDashboardChecks.Run();
        MathscriptSurfaceImport.EnsureTextures();
        var surfaces = new MathscriptSurfaces(Shader.Find("Standard"));
        try
        {
            Vector3 size = new Vector3(0.8f, 1.2f, 0.5f);
            Mesh mesh = surfaces.GetBox(size);
            Require(mesh.vertexCount == 96 && mesh.triangles.Length == 324, "Beveled geometry has a bounded cost");
            Require(ReferenceEquals(mesh, surfaces.GetBox(size)), "Repeated equipment reuses geometry");
            Require(Vector3.Distance(mesh.bounds.size, size) < 0.001f, "Bevels preserve equipment dimensions");
            Vector3[] positions = mesh.vertices;
            Vector3[] normals = mesh.normals;
            int[] triangles = mesh.triangles;
            for (int index = 0; index < normals.Length; index++)
                Require(float.IsFinite(positions[index].x) && Mathf.Abs(normals[index].magnitude - 1) < 0.001f, "Vertices and normals are finite and normalized");
            for (int index = 0; index < triangles.Length; index += 3)
            {
                int first = triangles[index];
                Vector3 face = Vector3.Cross(positions[triangles[index + 1]] - positions[first], positions[triangles[index + 2]] - positions[first]);
                Require(Vector3.Dot(face, normals[first]) > 0, "Box faces point outward");
            }
            Material rock = surfaces.GetMaterial(MathscriptSurfaces.Surface.Rock, Color.gray);
            Material steel = surfaces.GetMaterial(MathscriptSurfaces.Surface.Steel, Color.gray);
            Require(rock != steel, "Rock and steel do not share their response to light");
            Require(rock.GetFloat("_Metallic") == 0 && rock.GetFloat("_Glossiness") < 0.15f, "Stone is rough and nonmetallic");
            Require(steel.GetFloat("_Metallic") > 0.75f, "Steel has a metallic response");
            Require(ReferenceEquals(steel, surfaces.GetMaterial(MathscriptSurfaces.Surface.Steel, Color.gray)), "Materials are cached");
            foreach (var surface in new[] { MathscriptSurfaces.Surface.Rock, MathscriptSurfaces.Surface.Concrete, MathscriptSurfaces.Surface.Steel, MathscriptSurfaces.Surface.Bark })
            {
                Material material = surfaces.GetMaterial(surface, Color.white);
                Require(material.mainTexture != null && material.GetTexture("_BumpMap") != null, "Scanned color and normal maps exist for " + surface);
                Require(material.mainTexture.width <= 1024 && ((Texture2D)material.mainTexture).mipmapCount > 1, "Textures stay within the mipmapped 1K budget");
                var importer = (UnityEditor.TextureImporter)UnityEditor.AssetImporter.GetAtPath(UnityEditor.AssetDatabase.GetAssetPath(material.GetTexture("_BumpMap")));
                Require(importer.textureType == UnityEditor.TextureImporterType.NormalMap && !importer.sRGBTexture, "Normal maps have correct linear import settings");
            }
            Require(surfaces.GetFoliage(0).vertexCount == 1368, "Layered needle sprays have a fixed sub-1400-vertex geometry budget");
            Require(ReferenceEquals(surfaces.GetFoliage(0), surfaces.GetFoliage(3)), "Tree variants reuse their meshes");
            Material needles = surfaces.GetMaterial(MathscriptSurfaces.Surface.Foliage, Color.white);
            Require(Resources.Load<Material>("Surfaces/NeedleCutout").IsKeywordEnabled("_ALPHATEST_ON"), "Packaged foliage material preserves the build's cutout shader variant");
            Require(needles.IsKeywordEnabled("_ALPHATEST_ON") && needles.mainTexture.width == 128, "Needle sprays use a bounded cutout atlas");
            Color32[] needlePixels = ((Texture2D)needles.mainTexture).GetPixels32();
            int covered = Array.FindAll(needlePixels, pixel => pixel.a > 100).Length;
            Require(covered > needlePixels.Length / 10 && covered < needlePixels.Length * 3 / 4, "Needle atlas has visible branches and genuine gaps");
            Material ground = surfaces.GetMaterial(MathscriptSurfaces.Surface.Ground, Color.white);
            Require(!ground.IsKeywordEnabled("_ALPHATEST_ON") && ground.mainTexture != needles.mainTexture, "Ground remains opaque rather than borrowing foliage transparency");
            Mesh outcrop = surfaces.GetRock(0);
            Require(outcrop.vertexCount == 84 && outcrop.bounds.size.x < 1.01f && outcrop.bounds.size.y < 1.01f && outcrop.bounds.size.z < 1.01f, "Organic rock stays inside its original dimensions");
            Require(ReferenceEquals(outcrop, surfaces.GetRock(3)), "Outcrop variants reuse their geometry");
            foreach (Vector3 normal in surfaces.GetFoliage(0).normals)
                Require(float.IsFinite(normal.x) && Mathf.Abs(normal.magnitude - 1) < 0.001f, "Both sides of foliage have usable lighting normals");
            Require(MathscriptPerspective.TravelProgress(4,4) == 0 && MathscriptPerspective.TravelProgress(0,4) == 1, "Eased elevator preserves its endpoints");
            Require(MathscriptPerspective.TravelProgress(3.6f,4) < 0.1f && MathscriptPerspective.TravelProgress(0.4f,4) > 0.9f, "Elevator eases into and out of travel");
            float previousProgress = 0;
            for (int sample = 0; sample <= 100; sample++)
            {
                float progress = MathscriptPerspective.TravelProgress(4 - sample * 0.04f,4);
                Require(progress >= previousProgress && progress <= 1, "Elevator progress is monotonic and bounded");
                previousProgress = progress;
            }
            Debug.Log("MATHSCRIPT_REALISM_PASS beveled geometry / outward normals / shared resources / physical materials");
        }
        finally
        {
            surfaces.Dispose();
        }
        MathscriptAtmosphereChecks.Run();
        Mathscript3DOnlyChecks.Run();
        MathscriptManagerChecks.Run();
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}