using System.Collections.Generic;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptWorker : MonoBehaviour
    {
        public enum Motion { Idle, Walk, Work, Carry }
        public SkinnedMeshRenderer Skin { get; private set; }
        public Motion CurrentMotion { get; private set; }
        private readonly List<Vector3> vertices = new List<Vector3>();
        private readonly List<BoneWeight> weights = new List<BoneWeight>();
        private readonly List<int>[] triangles = new List<int>[10];
        private Transform[] bones;
        private Vector3[] rest;
        private Quaternion[] previousRotations;
        private Vector3[] previousPositions;
        private Transform packet;
        private Mesh bodyMesh;
        private Mesh packetMesh;
        private Material[] materials;
        public bool IsManager { get; private set; }

        public void Initialize(Shader shader, Color uniform, int variation, bool manager = false, Hero hero = Hero.None)
        {
            HeroIdentity = hero == Hero.None && manager ? Hero.Arcanos : hero;
            IsManager = HeroIdentity != Hero.None;
            manager = IsManager;
            for (int index = 0; index < triangles.Length; index++) triangles[index] = new List<int>();
            var positions = new[] {
                new Vector3(0,0.53f,0), new Vector3(0,0.67f,0), new Vector3(0,0.8f,0), new Vector3(0,0.94f,0),
                new Vector3(-0.18f,0.79f,0), new Vector3(-0.22f,0.59f,0), new Vector3(-0.22f,0.41f,0),
                new Vector3(0.18f,0.79f,0), new Vector3(0.22f,0.59f,0), new Vector3(0.22f,0.41f,0),
                new Vector3(-0.09f,0.52f,0), new Vector3(-0.09f,0.29f,0), new Vector3(-0.09f,0.07f,0),
                new Vector3(0.09f,0.52f,0), new Vector3(0.09f,0.29f,0), new Vector3(0.09f,0.07f,0) };
            int[] parents = { -1,0,1,2,2,4,5,2,7,8,0,10,11,0,13,14 };
            string[] names = { "Pelvis","Spine","Chest","Head","Left shoulder","Left elbow","Left hand",
                "Right shoulder","Right elbow","Right hand","Left hip","Left knee","Left foot","Right hip","Right knee","Right foot" };
            bones = new Transform[positions.Length];
            rest = new Vector3[positions.Length];
            previousRotations = new Quaternion[positions.Length];
            previousPositions = new Vector3[positions.Length];
            for (int index = 0; index < bones.Length; index++)
            {
                bones[index] = new GameObject(names[index]).transform;
                bones[index].SetParent(parents[index] < 0 ? transform : bones[parents[index]], false);
                rest[index] = parents[index] < 0 ? positions[index] : positions[index] - positions[parents[index]];
                bones[index].localPosition = rest[index];
            }
            Color32[] skinTones = { new Color32(219,173,140,255), new Color32(137,91,68,255),
                new Color32(186,128,91,255), new Color32(99,64,48,255) };
            Color32[] hairTones = { new Color32(45,32,26,255), new Color32(24,23,22,255),
                new Color32(92,61,38,255), new Color32(66,47,37,255) };
            int identity = Mathf.Abs(variation) % skinTones.Length;
            Color skinTone = skinTones[identity];
            Color[] palette = { uniform, new Color32(39,56,65,255), skinTone,
                new Color32(240,194,58,255), new Color32(18,26,31,255), new Color32(224,237,236,255),
                Color.Lerp(skinTone, new Color32(116,47,43,255), 0.42f), hairTones[identity],
                new Color32(17,16,15,255), new Color32(78,89,63,255) };
            if (manager)
            {
                palette[0] = new Color32(86, 37, 130, 255);
                palette[1] = new Color32(49, 25, 75, 255);
                palette[5] = new Color32(71, 221, 255, 255);
                ConfigureHeroPalette(palette);
            }
            materials = new Material[palette.Length];
            for (int index = 0; index < palette.Length; index++)
            {
                materials[index] = new Material(shader) { color = palette[index] };
                materials[index].SetFloat("_Glossiness", index == 2 ? 0.14f : index == 8 || index == 9 ? 0.38f : 0.1f);
            }
            AddProfile(new[] { new Vector3(0,0.48f,0), new Vector3(0,0.55f,0), new Vector3(0,0.68f,0), new Vector3(0,0.79f,0), new Vector3(0,0.83f,0) },
                new[] { new Vector2(0.12f,0.075f), new Vector2(0.13f,0.082f), new Vector2(0.125f,0.082f), new Vector2(0.155f,0.084f), new Vector2(0.1f,0.065f) }, 0,2,0);
            AddProfile(new[] { new Vector3(0,0.83f,0), new Vector3(0,0.9f,0) }, new[] { new Vector2(0.036f,0.035f), new Vector2(0.033f,0.032f) }, 2,3,2);
            AddFace(variation, manager);
            if (!manager)
            {
                Ellipsoid(new Vector3(0,1.027f,0), new Vector3(0.085f,0.047f,0.078f),3,3);
                Ellipsoid(new Vector3(0,1.014f,-0.008f), new Vector3(0.097f,0.008f,0.088f),3,3);
            }
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                int shoulder = side == 0 ? 4 : 7;
                int hip = side == 0 ? 10 : 13;
                AddProfile(new[] { positions[shoulder], Vector3.Lerp(positions[shoulder],positions[shoulder+1],0.45f), positions[shoulder+1] },
                    new[] { new Vector2(0.052f,0.049f), new Vector2(0.046f,0.044f), new Vector2(0.035f,0.033f) },shoulder,shoulder+1,0);
                AddProfile(new[] { positions[shoulder+1], Vector3.Lerp(positions[shoulder+1],positions[shoulder+2],0.35f), positions[shoulder+2] },
                    new[] { new Vector2(0.032f,0.031f), new Vector2(0.036f,0.034f), new Vector2(0.023f,0.022f) },shoulder+1,shoulder+2,2);
                Ellipsoid(positions[shoulder+1],new Vector3(0.038f,0.018f,0.036f),shoulder+1,1);
                AddHand(positions[shoulder+2],shoulder+2,sign);
                AddLimb(positions[hip],positions[hip+1],positions[hip+2],0.073f,0.056f,0.042f,hip,1);
                if (manager) AddHeroBoot(positions[hip+2],hip+2);
                else Ellipsoid(positions[hip+2] + new Vector3(0,-0.025f,-0.033f),new Vector3(0.06f,0.045f,0.101f),hip+2,4);
            }
            Ellipsoid(new Vector3(0,0.714f,-0.09f),new Vector3(0.037f,0.018f,0.008f),2,5);
            if (manager) AddHeroCostume();
            else AddWorkwear();
            bodyMesh = new Mesh { name = "Mathscript detailed adult human" };
            if (manager) bodyMesh.name = "Original " + HeroIdentity + " hero";
            bodyMesh.SetVertices(vertices);
            bodyMesh.boneWeights = weights.ToArray();
            var bindposes = new Matrix4x4[bones.Length];
            for (int index = 0; index < bones.Length; index++) bindposes[index] = bones[index].worldToLocalMatrix * transform.localToWorldMatrix;
            bodyMesh.bindposes = bindposes;
            bodyMesh.subMeshCount = triangles.Length;
            for (int index = 0; index < triangles.Length; index++) bodyMesh.SetTriangles(triangles[index],index);
            bodyMesh.RecalculateNormals();
            bodyMesh.RecalculateBounds();
            Skin = gameObject.AddComponent<SkinnedMeshRenderer>();
            Skin.sharedMesh = bodyMesh;
            Skin.sharedMaterials = materials;
            Skin.bones = bones;
            Skin.rootBone = bones[0];
            Skin.quality = SkinQuality.Bone2;
            Skin.localBounds = new Bounds(new Vector3(0,0.7f,0),new Vector3(1.5f,1.9f,1.5f));
            packet = new GameObject("Carried data case").transform;
            packet.SetParent(bones[9],false);
            packet.localPosition = new Vector3(-0.075f,-0.04f,-0.025f);
            packetMesh = new Mesh { name = "Original data case" };
            packetMesh.vertices = new[] { new Vector3(-0.13f,-0.07f,-0.07f),new Vector3(0.13f,-0.07f,-0.07f),new Vector3(0.13f,0.07f,-0.07f),new Vector3(-0.13f,0.07f,-0.07f),
                new Vector3(-0.13f,-0.07f,0.07f),new Vector3(0.13f,-0.07f,0.07f),new Vector3(0.13f,0.07f,0.07f),new Vector3(-0.13f,0.07f,0.07f) };
            packetMesh.triangles = new[] { 0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5 };
            packetMesh.RecalculateNormals();
            packetMesh.RecalculateBounds();
            packet.gameObject.AddComponent<MeshFilter>().sharedMesh = packetMesh;
            packet.gameObject.AddComponent<MeshRenderer>().sharedMaterial = materials[3];
            Pose(Motion.Idle,0);
        }

        private void AddFace(int variation, bool manager)
        {
            if (manager)
            {
                AddHeroFace();
                return;
            }
            AddProfile(new[] { new Vector3(0,0.889f,-0.012f), new Vector3(0,0.901f,-0.006f), new Vector3(0,0.923f,0),
                new Vector3(0,0.954f,0), new Vector3(0,0.984f,0), new Vector3(0,1.011f,0.004f), new Vector3(0,1.032f,0.004f), new Vector3(0,1.039f,0.004f) },
                new[] { new Vector2(0.026f,0.037f), new Vector2(0.043f,0.049f), new Vector2(0.057f,0.06f),
                    new Vector2(0.07f,0.067f), new Vector2(0.069f,0.065f), new Vector2(0.06f,0.058f), new Vector2(0.035f,0.036f), Vector2.one*0.002f },3,3,2);
            Ellipsoid(new Vector3(0,0.957f,-0.065f),new Vector3(0.009f,0.024f,0.013f),3,2);
            Ellipsoid(new Vector3(0,0.942f,-0.078f),new Vector3(0.013f,0.01f,0.012f),3,2);
            Ellipsoid(new Vector3(0,0.919f,-0.058f),new Vector3(0.02f,0.0035f,0.005f),3,6);
            Ellipsoid(new Vector3(0,0.912f,-0.058f),new Vector3(0.018f,0.004f,0.005f),3,6);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                Ellipsoid(new Vector3(sign*0.026f,0.968f,-0.059f),new Vector3(0.01f,0.005f,0.006f),3,5);
                Ellipsoid(new Vector3(sign*0.026f,0.968f,-0.064f),new Vector3(0.004f,0.004f,0.002f),3,9);
                Ellipsoid(new Vector3(sign*0.026f,0.968f,-0.066f),new Vector3(0.002f,0.0025f,0.001f),3,8);
                Ellipsoid(new Vector3(sign*0.026f,0.976f,-0.061f),new Vector3(0.014f,0.003f,0.006f),3,2);
                Ellipsoid(new Vector3(sign*0.027f,0.985f,-0.06f),new Vector3(0.015f,0.003f,0.004f),3,7);
                Ellipsoid(new Vector3(sign*0.069f,0.952f,0),new Vector3(0.011f,0.021f,0.013f),3,2);
                Ellipsoid(new Vector3(sign*0.077f,0.952f,-0.004f),new Vector3(0.003f,0.012f,0.007f),3,6);
                Ellipsoid(new Vector3(sign*0.061f,0.988f,0.011f),new Vector3(0.01f,0.032f,0.047f),3,7);
            }
            Ellipsoid(new Vector3(0,1.018f,0.006f),new Vector3(0.062f,0.028f,0.059f),3,7);
            if (!manager && Mathf.Abs(variation) % 3 == 1)
                AddProfile(new[] { new Vector3(0,0.897f,-0.012f), new Vector3(0,0.903f,-0.008f), new Vector3(0,0.922f,-0.005f) },
                    new[] { new Vector2(0.029f,0.039f), new Vector2(0.045f,0.051f), new Vector2(0.055f,0.059f) },3,3,7);
        }

        private void AddHand(Vector3 wrist, int bone, float sign)
        {
            AddProfile(new[] { wrist,wrist+new Vector3(0,-0.015f,-0.003f),wrist+new Vector3(0,-0.04f,-0.003f) },
                new[] { new Vector2(0.018f,0.011f),new Vector2(0.024f,0.012f),new Vector2(0.02f,0.011f) },bone,bone,2);
            for (int finger = 0; finger < 4; finger++)
            {
                float offset = (finger-1.5f)*0.012f;
                float length = finger == 0 || finger == 3 ? 0.026f : 0.036f;
                AddProfile(new[] { wrist+new Vector3(offset,-0.038f,-0.003f), wrist+new Vector3(offset,-0.05f-length*0.3f,-0.008f),
                    wrist+new Vector3(offset,-0.043f-length,-0.018f) },
                    new[] { new Vector2(0.006f,0.007f), new Vector2(0.0055f,0.006f), new Vector2(0.004f,0.0045f) },bone,bone,2);
            }
            Ellipsoid(wrist+new Vector3(-sign*0.025f,-0.027f,-0.008f),new Vector3(0.012f,0.021f,0.009f),bone,2);
        }

        private void AddWorkwear()
        {
            AddProfile(new[] { new Vector3(0,0.523f,0),new Vector3(0,0.545f,0) },
                new[] { new Vector2(0.14f,0.094f),new Vector2(0.141f,0.095f) },0,0,4);
            Ellipsoid(new Vector3(0,0.534f,-0.094f),new Vector3(0.023f,0.015f,0.005f),0,3);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                AddProfile(new[] { new Vector3(sign*0.087f,0.58f,-0.071f),new Vector3(sign*0.099f,0.69f,-0.075f),new Vector3(sign*0.109f,0.78f,-0.073f) },
                    new[] { new Vector2(0.008f,0.004f),new Vector2(0.009f,0.004f),new Vector2(0.008f,0.004f) },0,2,5);
                AddProfile(new[] { new Vector3(sign*0.056f,0.719f,-0.081f),new Vector3(sign*0.056f,0.759f,-0.081f) },
                    new[] { new Vector2(0.026f,0.005f),new Vector2(0.026f,0.005f) },2,2,1);
                Ellipsoid(new Vector3(sign*0.09f,0.297f,-0.049f),new Vector3(0.04f,0.054f,0.016f),side == 0 ? 11 : 14,4);
                Ellipsoid(new Vector3(sign*0.09f,0.025f,-0.033f),new Vector3(0.061f,0.009f,0.102f),side == 0 ? 12 : 15,1);
            }
        }

        private void AddManagerCostume()
        {
            materials[5].EnableKeyword("_EMISSION");
            materials[5].SetColor("_EmissionColor", new Color(0.08f, 0.55f, 0.8f));
            AddProfile(new[] { new Vector3(0,0.07f,0.02f), new Vector3(0,0.25f,0.02f), new Vector3(0,0.48f,0), new Vector3(0,0.58f,0) },
                new[] { new Vector2(0.24f,0.16f), new Vector2(0.21f,0.14f), new Vector2(0.15f,0.1f), new Vector2(0.14f,0.095f) },0,0,1);
            AddProfile(new[] { new Vector3(0,0.08f,0.02f), new Vector3(0,0.1f,0.02f) },
                new[] { new Vector2(0.245f,0.165f), new Vector2(0.243f,0.164f) },0,0,3);
            AddProfile(new[] { new Vector3(0,0.56f,0), new Vector3(0,0.59f,0) },
                new[] { new Vector2(0.15f,0.102f), new Vector2(0.15f,0.102f) },0,0,3);
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1 : 1;
                int shoulder = side == 0 ? 4 : 7;
                Ellipsoid(new Vector3(sign*0.18f,0.79f,0),new Vector3(0.115f,0.055f,0.12f),shoulder,3);
                Ellipsoid(new Vector3(sign*0.18f,0.81f,-0.005f),new Vector3(0.102f,0.045f,0.11f),shoulder,0);
                for (int rune = 0; rune < 3; rune++)
                    Ellipsoid(new Vector3(sign*(0.075f+rune*0.022f),0.75f+rune*0.027f,-0.095f),new Vector3(0.009f,0.018f,0.006f),2,5);
            }
            AddProfile(new[] { new Vector3(0,1.01f,0), new Vector3(0,1.035f,0) },
                new[] { new Vector2(0.29f,0.25f), new Vector2(0.27f,0.23f) },3,3,0);
            AddProfile(new[] { new Vector3(0,1.03f,0), new Vector3(0,1.16f,0), new Vector3(0.02f,1.32f,0), new Vector3(0.09f,1.41f,0), new Vector3(0.15f,1.36f,0) },
                new[] { new Vector2(0.125f,0.115f), new Vector2(0.105f,0.1f), new Vector2(0.07f,0.065f), new Vector2(0.038f,0.035f), new Vector2(0.005f,0.005f) },3,3,0);
            AddProfile(new[] { new Vector3(0,1.04f,0), new Vector3(0,1.065f,0) },
                new[] { new Vector2(0.127f,0.117f), new Vector2(0.125f,0.115f) },3,3,3);
            Ellipsoid(new Vector3(0,1.09f,-0.116f),new Vector3(0.028f,0.029f,0.008f),3,5);
            for (int strand = 0; strand < 7; strand++)
            {
                float offset = (strand-3)*0.022f;
                AddProfile(new[] { new Vector3(offset,0.925f,-0.075f),new Vector3(offset,0.86f,-0.105f),new Vector3(offset*0.65f,0.73f,-0.13f),new Vector3(offset*0.3f,0.65f+Mathf.Abs(offset),-0.115f) },
                        new[] { new Vector2(0.022f,0.025f),new Vector2(0.024f,0.027f),new Vector2(0.016f,0.019f),new Vector2(0.003f,0.005f) },3,3,7);
            }
                    materials[7].color = new Color32(173, 182, 196, 255);
            AddProfile(new[] { new Vector3(-0.3f,0.05f,-0.04f),new Vector3(-0.3f,1.12f,-0.04f) },
                new[] { Vector2.one*0.018f,Vector2.one*0.018f },6,6,3);
            AddProfile(new[] { new Vector3(-0.3f,1.1f,-0.04f),new Vector3(-0.3f,1.22f,-0.04f),new Vector3(-0.3f,1.37f,-0.04f) },
                new[] { Vector2.one*0.005f,Vector2.one*0.072f,Vector2.one*0.002f },6,6,5);
        }

        private void AddLimb(Vector3 start, Vector3 joint, Vector3 end, float startRadius, float jointRadius, float endRadius, int bone, int material)
        {
            AddProfile(new[] { start,Vector3.Lerp(start,joint,0.55f),joint },
                new[] { Vector2.one*startRadius,Vector2.one*Mathf.Lerp(startRadius,jointRadius,0.45f),Vector2.one*jointRadius },bone,bone+1,material);
            AddProfile(new[] { joint,Vector3.Lerp(joint,end,0.4f),end },
                new[] { Vector2.one*jointRadius,Vector2.one*Mathf.Lerp(jointRadius,endRadius,0.2f),Vector2.one*endRadius },bone+1,bone+2,material);
        }

        private void Ellipsoid(Vector3 center, Vector3 radius, int bone, int material)
        {
            var centers = new Vector3[7];
            var sizes = new Vector2[7];
            for (int ring = 0; ring < centers.Length; ring++)
            {
                float latitude = -Mathf.PI/2 + ring*Mathf.PI/6;
                centers[ring] = center + Vector3.up*(Mathf.Sin(latitude)*radius.y);
                sizes[ring] = new Vector2(radius.x,radius.z)*Mathf.Max(0.01f,Mathf.Cos(latitude));
            }
            AddProfile(centers,sizes,bone,bone,material);
        }

        private void AddProfile(Vector3[] centers, Vector2[] sizes, int firstBone, int lastBone, int material, int sides = 16)
        {
            int offset = vertices.Count;
            for (int ring = 0; ring < centers.Length; ring++)
            {
                float blend = (float)ring/(centers.Length-1)*(lastBone-firstBone);
                int lower = firstBone + Mathf.FloorToInt(blend);
                int upper = Mathf.Min(lastBone,lower+1);
                float fraction = blend-Mathf.Floor(blend);
                for (int side = 0; side < sides; side++)
                {
                    float angle = side*Mathf.PI*2/sides;
                    vertices.Add(centers[ring]+new Vector3(Mathf.Cos(angle)*sizes[ring].x,0,Mathf.Sin(angle)*sizes[ring].y));
                    weights.Add(new BoneWeight { boneIndex0=lower,boneIndex1=upper,weight0=1-fraction,weight1=fraction });
                    if (ring == 0) continue;
                    int previous = offset+(ring-1)*sides+side;
                    int next = offset+(ring-1)*sides+(side+1)%sides;
                    int current = offset+ring*sides+side;
                    int currentNext = offset+ring*sides+(side+1)%sides;
                    triangles[material].AddRange(new[] { previous,current,next,next,current,currentNext });
                }
            }
            for (int side = 1; side < sides-1; side++)
            {
                triangles[material].AddRange(new[] { offset,offset+side,offset+side+1 });
                int top = offset+(centers.Length-1)*sides;
                triangles[material].AddRange(new[] { top,top+side+1,top+side });
            }
        }

        public void Pose(Motion motion, float time, float blend = 1)
        {
            if (IsManager) motion = Motion.Idle;
            CurrentMotion = motion;
            for (int index = 0; index < bones.Length; index++)
            {
                previousRotations[index] = bones[index].localRotation;
                previousPositions[index] = bones[index].localPosition;
                bones[index].localPosition = rest[index];
                bones[index].localRotation = Quaternion.identity;
            }
            float cycle = time*6;
            float stride = Mathf.Sin(cycle);
            bool moving = motion == Motion.Walk || motion == Motion.Carry;
            bones[0].localPosition += new Vector3(moving ? stride*0.005f : Mathf.Sin(time*0.9f)*0.003f,
                moving ? Mathf.Abs(stride)*0.009f : Mathf.Sin(time*2)*0.0025f,0);
            bones[0].localRotation = Quaternion.Euler(0,moving ? stride*3 : 0,moving ? stride*1.5f : Mathf.Sin(time*0.9f)*1.2f);
            bones[1].localRotation = Quaternion.Euler(motion == Motion.Work ? -6 : moving ? -2 : 0,moving ? -stride*3 : Mathf.Sin(time*2)*1.2f,0);
            bones[3].localRotation = Quaternion.Euler(motion == Motion.Work ? 8 : 0,Mathf.Sin(time*1.1f)*3,0);
            bones[4].localRotation = Quaternion.Euler(-3,0,-4);
            bones[7].localRotation = Quaternion.Euler(-3,0,4);
            bones[5].localRotation = Quaternion.Euler(8,0,0);
            bones[8].localRotation = Quaternion.Euler(8,0,0);
            if (moving)
            {
                bones[10].localRotation = Quaternion.Euler(stride*23,0,0);
                bones[13].localRotation = Quaternion.Euler(-stride*23,0,0);
                bones[11].localRotation = Quaternion.Euler(-Mathf.Max(0,-stride)*32,0,0);
                bones[14].localRotation = Quaternion.Euler(-Mathf.Max(0,stride)*32,0,0);
                bones[12].localRotation = Quaternion.Euler(-stride*8,0,0);
                bones[15].localRotation = Quaternion.Euler(stride*8,0,0);
                bones[4].localRotation = Quaternion.Euler(-stride*16,0,-4);
                bones[7].localRotation = Quaternion.Euler(stride*16,0,4);
                bones[5].localRotation = Quaternion.Euler(12+Mathf.Max(0,stride)*8,0,0);
                bones[8].localRotation = Quaternion.Euler(12+Mathf.Max(0,-stride)*8,0,0);
            }
            if (motion == Motion.Work || motion == Motion.Carry)
            {
                float action = motion == Motion.Work ? Mathf.Sin(time*5)*6 : 0;
                bones[4].localRotation = Quaternion.Euler(18+action,-12,motion == Motion.Carry ? 12 : -4);
                bones[7].localRotation = Quaternion.Euler(18-action,12,motion == Motion.Carry ? -12 : 4);
                bones[5].localRotation = Quaternion.Euler(60+action,0,0);
                bones[8].localRotation = Quaternion.Euler(60-action,0,0);
                bones[6].localRotation = Quaternion.Euler(-12,0,-8);
                bones[9].localRotation = Quaternion.Euler(-12,0,8);
            }
            if (blend < 1)
            {
                for (int index = 0; index < bones.Length; index++)
                {
                    bones[index].localRotation = Quaternion.Slerp(previousRotations[index], bones[index].localRotation, blend);
                    bones[index].localPosition = Vector3.Lerp(previousPositions[index], bones[index].localPosition, blend);
                }
            }
            packet.gameObject.SetActive(motion == Motion.Carry);
        }

        private void OnDestroy()
        {
            if (bodyMesh != null) DestroyImmediate(bodyMesh);
            if (packetMesh != null) DestroyImmediate(packetMesh);
            if (materials != null) foreach (var material in materials) DestroyImmediate(material);
        }
    }
}