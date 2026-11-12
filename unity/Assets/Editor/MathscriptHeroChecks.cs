using System;
using UnityEngine;
using MathscriptPrototype;

public static class MathscriptHeroChecks
{
    public static void Run()
    {
        MathscriptManagerChecks.Run();
        var root = new GameObject("Hero cast validation");
        var baked = new Mesh();
        try
        {
            var signatures = new System.Collections.Generic.HashSet<long>();
            foreach (MathscriptWorker.Hero identity in Enum.GetValues(typeof(MathscriptWorker.Hero)))
            {
                if (identity == MathscriptWorker.Hero.None) continue;
                var character = new GameObject(identity.ToString());
                character.transform.SetParent(root.transform,false);
                var hero = character.AddComponent<MathscriptWorker>();
                hero.Initialize(Shader.Find("Standard"),Color.cyan,(int)identity,true,identity);
                Mesh mesh = hero.Skin.sharedMesh;
                Require(hero.HeroIdentity == identity && hero.IsManager,"The cast retains distinct hero identities: " + identity);
                Require(mesh.name == "Original " + identity + " hero","The named hero uses its own model: " + identity);
                Require(mesh.vertexCount > 3000 && mesh.vertexCount < 15000 && mesh.subMeshCount == 10 && hero.Skin.bones.Length == 16,
                    "Hero preserves the bounded shared animation contract: " + identity + " vertices=" + mesh.vertexCount);
                Require(mesh.bounds.max.y*MathscriptPerspective.HeroScale+0.09f < 1.85f,
                    "Hero and signature accessories leave clear headroom in the 2.5-unit room: " + identity);
                if (identity == MathscriptWorker.Hero.Luna)
                    Require(hero.Skin.sharedMaterials[7].color.r > 0.8f,"Luna retains silver hair independently of footwear");
                foreach (BoneWeight weight in mesh.boneWeights)
                    Require(Mathf.Abs(weight.weight0+weight.weight1-1) < 0.0001f && weight.boneIndex0 < 16 && weight.boneIndex1 < 16,
                        "Hero uses normalized weights and valid bones: " + identity);
                long signature = 17;
                foreach (Vector3 vertex in mesh.vertices)
                    signature = unchecked(signature*31+Mathf.RoundToInt(vertex.x*10000)+Mathf.RoundToInt(vertex.y*10000)*7+Mathf.RoundToInt(vertex.z*10000)*13);
                Require(signatures.Add(signature),"Heroes differ in actual geometry, not only their colors: " + identity);
                hero.Pose(MathscriptWorker.Motion.Idle,0.2f);
                hero.Skin.BakeMesh(baked);
                Vector3[] first = baked.vertices;
                hero.Pose(MathscriptWorker.Motion.Work,0.8f);
                hero.Skin.BakeMesh(baked);
                Vector3[] second = baked.vertices;
                float movement = 0;
                for (int index = 0; index < second.Length; index++)
                {
                    Require(float.IsFinite(second[index].x) && float.IsFinite(second[index].y) && float.IsFinite(second[index].z),
                        "Animated hero costume stays finite: " + identity);
                    movement += (second[index]-first[index]).sqrMagnitude;
                }
                Require(movement > 0.00001f && hero.CurrentMotion == MathscriptWorker.Motion.Idle,
                    "Hero breathes without adopting crew tool poses: " + identity);
                Debug.Log("MATHSCRIPT_HERO_MODEL_PASS " + identity + " vertices=" + mesh.vertexCount);
            }
            Require(signatures.Count == 7,"Every Unity department has a distinct character model");
            Mathscript3DOnlyChecks.Run();
            Debug.Log("MATHSCRIPT_HERO_CHARACTERS_PASS all seven heroes");
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(baked);
            UnityEngine.Object.DestroyImmediate(root);
        }
    }

    public static void CaptureCast()
    {
        Run();
        var setup = UnityEditor.SceneManagement.EditorSceneManager.GetSceneManagerSetup();
        UnityEditor.SceneManagement.EditorSceneManager.NewScene(UnityEditor.SceneManagement.NewSceneSetup.EmptyScene);
        var target = new RenderTexture(2400,1100,24);
        var image = new Texture2D(2400,1100,TextureFormat.RGB24,false);
        RenderTexture previous = RenderTexture.active;
        try
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.7f,0.7f,0.7f);
            var key = new GameObject("Cast portrait light").AddComponent<Light>();
            key.type = LightType.Directional;
            key.intensity = 1.15f;
            key.transform.rotation = Quaternion.Euler(32,-25,0);
            var camera = new GameObject("Hero cast camera").AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color32(216,227,223,255);
            camera.orthographic = true;
            camera.orthographicSize = 1.35f;
            camera.transform.position = new Vector3(0,0.72f,-7);
            camera.targetTexture = target;
            for (int floor = 0; floor < 7; floor++)
            {
                var hero = new GameObject(((MathscriptWorker.Hero)floor).ToString()).AddComponent<MathscriptWorker>();
                hero.transform.position = new Vector3((floor-3)*0.79f,0,0);
                hero.Initialize(Shader.Find("Standard"),Color.cyan,floor,true,(MathscriptWorker.Hero)floor);
                hero.Pose(MathscriptWorker.Motion.Idle,0.35f);
            }
            camera.Render();
            RenderTexture.active = target;
            image.ReadPixels(new Rect(0,0,2400,1100),0,0);
            image.Apply();
            string directory = System.IO.Path.GetFullPath("Logs");
            System.IO.Directory.CreateDirectory(directory);
            string path = System.IO.Path.Combine(directory,"hero-cast.png");
            System.IO.File.WriteAllBytes(path,image.EncodeToPNG());
            Debug.Log("MATHSCRIPT_HERO_PORTRAITS_PASS " + path);
        }
        finally
        {
            RenderTexture.active = previous;
            UnityEngine.Object.DestroyImmediate(image);
            target.Release();
            UnityEngine.Object.DestroyImmediate(target);
            if (Array.Exists(setup,scene => scene.isActive && scene.isLoaded))
                UnityEditor.SceneManagement.EditorSceneManager.RestoreSceneManagerSetup(setup);
            else UnityEditor.SceneManagement.EditorSceneManager.NewScene(UnityEditor.SceneManagement.NewSceneSetup.EmptyScene);
        }
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}