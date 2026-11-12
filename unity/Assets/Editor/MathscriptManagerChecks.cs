using System;
using UnityEngine;
using MathscriptPrototype;

public static class MathscriptManagerChecks
{
    public static void Run()
    {
        MathscriptWorkerChecks.Run();
        var root = new GameObject("Arcanos validation");
        var baked = new Mesh();
        try
        {
            var manager = root.AddComponent<MathscriptWorker>();
            manager.Initialize(Shader.Find("Standard"), Color.magenta, 0, true);
            var mesh = manager.Skin.sharedMesh;
            Require(manager.IsManager && mesh.vertexCount > 2000, "Manager has original costume geometry");
            bool headAttachment = false;
            bool staffAttachment = false;
            var vertices = mesh.vertices;
            var weights = mesh.boneWeights;
            for (int index = 0; index < vertices.Length; index++)
            {
                var weight = weights[index];
                Require(Mathf.Abs(weight.weight0 + weight.weight1 - 1) < 0.0001f, "Normalized weights");
                Require(weight.boneIndex0 >= 0 && weight.boneIndex0 < 16 && weight.boneIndex1 >= 0 && weight.boneIndex1 < 16, "Valid bone indices");
                headAttachment |= vertices[index].y > 1.3f && weight.boneIndex0 == 3;
                staffAttachment |= vertices[index].y > 1.3f && weight.boneIndex0 == 6;
            }
            Require(headAttachment && staffAttachment, "Hat and staff follow head and hand bones");
            manager.Pose(MathscriptWorker.Motion.Idle, 0.2f);
            manager.Skin.BakeMesh(baked);
            var before = baked.vertices;
            manager.Pose(MathscriptWorker.Motion.Work, 0.8f);
            manager.Skin.BakeMesh(baked);
            float movement = 0;
            vertices = baked.vertices;
            for (int index = 0; index < vertices.Length; index++)
            {
                var vertex = vertices[index];
                Require(float.IsFinite(vertex.x) && float.IsFinite(vertex.y) && float.IsFinite(vertex.z), "Finite deformed vertices");
                movement += (vertex - before[index]).sqrMagnitude;
            }
            Require(movement > 0.00001f && manager.CurrentMotion == MathscriptWorker.Motion.Idle, "Manager breathes without worker tool poses");
            Debug.Log("MATHSCRIPT_MANAGER_SKINNING_PASS vertices=" + mesh.vertexCount);
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(baked);
            UnityEngine.Object.DestroyImmediate(root);
        }
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}