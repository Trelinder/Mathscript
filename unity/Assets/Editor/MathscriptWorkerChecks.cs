using System;
using UnityEngine;
using MathscriptPrototype;

public static class MathscriptWorkerChecks
{
    public static void Run()
    {
        var root = new GameObject("Worker validation");
        var baked = new Mesh();
        try
        {
            var worker = root.AddComponent<MathscriptWorker>();
            worker.Initialize(Shader.Find("Standard"),Color.cyan,0);
            var mesh = worker.Skin.sharedMesh;
            Require(mesh.vertexCount > 500 && worker.Skin.bones.Length == 16,"Original human mesh and skeleton exist");
            Require(mesh.vertexCount > 4000 && mesh.vertexCount < 15000,"Detailed humanoid stays within the per-worker geometry budget: " + mesh.vertexCount);
            Require(mesh.subMeshCount == 10,"Face, hair, eyes, workwear and skin have independent materials");
            Require(worker.Skin.sharedMaterials[0].GetFloat("_Glossiness") <= 0.15f,"Workwear is matte rather than plastic");
            Require(worker.Skin.sharedMaterials[2].color != worker.Skin.sharedMaterials[6].color,"Lips and skin retain distinct natural tones");
            Require(worker.Skin.sharedMaterials[4].color != worker.Skin.sharedMaterials[7].color,"Hair does not recolor footwear");
            worker.Pose(MathscriptWorker.Motion.Carry,0.4f);
            Require(worker.Skin.bones[6].position.z < -0.12f && worker.Skin.bones[9].position.z < -0.12f,"Both carrying hands reach in front of the torso");
            Require(Mathf.Abs(worker.Skin.bones[9].position.x-worker.Skin.bones[6].position.x) < 0.3f,"Carry pose brings both hands within case width");
            bool blended = false;
            foreach (var weight in mesh.boneWeights)
            {
                Require(Mathf.Abs(weight.weight0+weight.weight1-1) < 0.0001f,"Weights are normalized");
                Require(weight.boneIndex0 < 16 && weight.boneIndex1 < 16,"Weights reference valid bones");
                blended |= weight.weight0 > 0 && weight.weight1 > 0;
            }
            Require(blended,"Mesh has blended skinning, not just rigid pieces");
            Vector3[] previous = null;
            foreach (MathscriptWorker.Motion motion in Enum.GetValues(typeof(MathscriptWorker.Motion)))
            {
                worker.Pose(motion,0.23f);
                worker.Skin.BakeMesh(baked);
                var first = baked.vertices;
                worker.Pose(motion,0.71f);
                worker.Skin.BakeMesh(baked);
                var second = baked.vertices;
                float movement = 0;
                float difference = 0;
                for (int index = 0; index < second.Length; index++)
                {
                    Require(float.IsFinite(second[index].x) && float.IsFinite(second[index].y) && float.IsFinite(second[index].z),"Skinning produces finite vertices");
                    movement += (second[index]-first[index]).sqrMagnitude;
                    if (previous != null) difference += (second[index]-previous[index]).sqrMagnitude;
                }
                Require(movement > 0.00001f,"Every motion deforms the mesh: " + motion);
                if (previous != null) Require(difference > 0.001f,"Motion poses differ: " + motion);
                Require(root.transform.Find("Pelvis/Spine/Chest/Right shoulder/Right elbow/Right hand/Carried data case").gameObject.activeSelf == (motion == MathscriptWorker.Motion.Carry),"Case visibility follows carry only");
                previous = second;
            }
            worker.Pose(MathscriptWorker.Motion.Walk,0.6f);
            Quaternion target = worker.Skin.bones[10].localRotation;
            worker.Pose(MathscriptWorker.Motion.Idle,0.2f);
            Quaternion initial = worker.Skin.bones[10].localRotation;
            worker.Pose(MathscriptWorker.Motion.Walk,0.6f,0.15f);
            Require(Mathf.Abs(Quaternion.Angle(initial,worker.Skin.bones[10].localRotation) - Quaternion.Angle(initial,target)*0.15f) < 0.02f,"Walk transitions blend rather than snap");
            for (int step = 0; step < 30; step++) worker.Pose(MathscriptWorker.Motion.Walk,0.6f,0.3f);
            Require(Quaternion.Angle(worker.Skin.bones[10].localRotation,target) < 0.05f,"Blended joints converge to the intended pose");
            Debug.Log("MATHSCRIPT_WORKER_SKINNING_PASS vertices=" + mesh.vertexCount);
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(baked);
            UnityEngine.Object.DestroyImmediate(root);
        }
    }

    public static void CapturePortraits()
    {
        MathscriptManagerChecks.Run();
        var setup = UnityEditor.SceneManagement.EditorSceneManager.GetSceneManagerSetup();
        UnityEditor.SceneManagement.EditorSceneManager.NewScene(UnityEditor.SceneManagement.NewSceneSetup.EmptyScene);
        var target = new RenderTexture(2000,900,24);
        var image = new Texture2D(2000,900,TextureFormat.RGB24,false);
        RenderTexture previousTarget = RenderTexture.active;
        try
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.68f,0.68f,0.68f);
            var light = new GameObject("Portrait key light").AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.transform.rotation = Quaternion.Euler(25,-30,0);
            var camera = new GameObject("Humanoid portrait camera").AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color32(207,220,218,255);
            camera.orthographic = true;
            camera.orthographicSize = 0.79f;
            camera.transform.position = new Vector3(0,0.7f,-5);
            camera.targetTexture = target;
            for (int identity = 0; identity < 5; identity++)
            {
                var worker = new GameObject("Human portrait " + identity).AddComponent<MathscriptWorker>();
                worker.transform.position = new Vector3((identity-2)*0.7f,0,0);
                worker.Initialize(Shader.Find("Standard"),new Color32(49,128,128,255),identity,identity == 4);
                worker.Pose(identity == 2 ? MathscriptWorker.Motion.Carry : MathscriptWorker.Motion.Idle,0.4f);
            }
            camera.Render();
            RenderTexture.active = target;
            image.ReadPixels(new Rect(0,0,2000,900),0,0);
            image.Apply();
            System.IO.File.WriteAllBytes("/tmp/mathscript-humanoid-portraits.png",image.EncodeToPNG());
            Debug.Log("MATHSCRIPT_HUMANOID_PORTRAITS_PASS /tmp/mathscript-humanoid-portraits.png");
        }
        finally
        {
            RenderTexture.active = previousTarget;
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