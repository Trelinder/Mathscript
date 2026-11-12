using System;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptPerspective
    {
        public const float HeroScale = 1.08f;
        [Serializable]
        public sealed class HeroVisualSnapshot
        {
            public string name;
            public int floor;
            public bool visible;
            public int vertices;
            public int bones;
            public string model;
            public Vector3 position;
            public Rect bounds;
            public Rect floorBounds;
            public Rect worldBounds;
        }

        private void BuildHero(int floor)
        {
            var identity = (MathscriptWorker.Hero)floor;
            var leader = new GameObject(identity + " department hero");
            leader.transform.SetParent(floors[floor],false);
            leader.transform.localPosition = new Vector3(-2.25f,0.09f,-1.12f);
            leader.transform.localRotation = Quaternion.Euler(0,-8,0);
            leader.transform.localScale = Vector3.one*HeroScale;
            heroes[floor] = leader.AddComponent<MathscriptWorker>();
            heroes[floor].Initialize(owner.towerShader,colors[floor],floor,true,identity);
            leader.SetActive(owner.State.levels[floor] > 0);
        }

        private void UpdateHero(int floor, float poseBlend)
        {
            var hero = heroes[floor];
            hero.gameObject.SetActive(owner.State.levels[floor] > 0);
            hero.transform.localPosition = new Vector3(stageRoot.localScale.x < 0.5f ? 2f : -2.25f,0.09f,-1.12f);
            hero.transform.localScale = new Vector3(HeroScale/stageRoot.localScale.x,HeroScale,HeroScale);
            hero.Pose(MathscriptWorker.Motion.Idle,Time.time+floor*0.7f,poseBlend);
        }

        public HeroVisualSnapshot[] HeroVisualState()
        {
            var snapshots = new HeroVisualSnapshot[heroes.Length];
            for (int floor = 0; floor < heroes.Length; floor++)
            {
                var hero = heroes[floor];
                Bounds local = hero.Skin.sharedMesh.bounds;
                snapshots[floor] = new HeroVisualSnapshot {
                    name = hero.HeroIdentity.ToString(),floor = floor,visible = hero.gameObject.activeInHierarchy,
                    vertices = hero.Skin.sharedMesh.vertexCount,bones = hero.Skin.bones.Length,model = hero.Skin.sharedMesh.name,
                    position = hero.transform.position,bounds = ProjectBounds(hero.transform,local),
                    floorBounds = ProjectBounds(floors[floor],new Bounds(new Vector3(0,1.2f,0),new Vector3(7,2.62f,4))),
                    worldBounds = new Rect(sceneCamera.pixelRect.x,Screen.height-sceneCamera.pixelRect.yMax,sceneCamera.pixelRect.width,sceneCamera.pixelRect.height) };
            }
            return snapshots;
        }

        private Rect ProjectBounds(Transform item, Bounds local)
        {
                Vector2 minimum = new Vector2(float.PositiveInfinity,float.PositiveInfinity);
                Vector2 maximum = new Vector2(float.NegativeInfinity,float.NegativeInfinity);
                for (int corner = 0; corner < 8; corner++)
                {
                    Vector3 point = new Vector3((corner&1) == 0 ? local.min.x : local.max.x,
                        (corner&2) == 0 ? local.min.y : local.max.y,(corner&4) == 0 ? local.min.z : local.max.z);
                    Vector3 screen = sceneCamera.WorldToScreenPoint(item.TransformPoint(point));
                    var position = new Vector2(screen.x,Screen.height-screen.y);
                    minimum = Vector2.Min(minimum,position);
                    maximum = Vector2.Max(maximum,position);
                }
            return Rect.MinMaxRect(minimum.x,minimum.y,maximum.x,maximum.y);
        }
    }
}