using System;
using System.Collections.Generic;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptPerspective
    {
        private Transform contractBay;
        private Transform contractTruck;
        private Transform contractDockStock;
        private Transform contractTruckCargo;
        private Transform contractTransfer;
        private Transform truckBeacon;
        private TextMesh truckCompanyMark;
        private readonly List<Transform> truckWheels = new List<Transform>();
        private readonly List<Renderer> truckLivery = new List<Renderer>();
        private int truckCompany = -1;
        private static readonly Color[] CompanyColors = {
            new Color32(228,109,82,255), new Color32(77,150,206,255), new Color32(216,181,70,255) };
        private const float TruckDockX = 2.15f;
        private const float TruckRoadX = 11;

        [Serializable]
        internal sealed class ContractVisualSnapshot
        {
            public bool truckVisible;
            public bool transferVisible;
            public string company;
            public Vector3 truckPosition;
            public Rect truckBounds;
            public int dockCrates;
            public int loadedCrates;
        }

        private void BuildContractLogistics(Transform stage)
        {
            contractBay = new GameObject("Contract pickup bay").transform;
            contractBay.SetParent(stage, false);
            Part(contractBay, "Freight access road", new Vector3(4.9f,0.12f,-2.25f), new Vector3(10.8f,0.055f,1.4f), new Color32(124,143,139,255));
            for (int mark = 0; mark < 8; mark++)
                Part(contractBay, "Pickup lane marking", new Vector3(0.2f + mark * 1.15f,0.154f,-1.58f), new Vector3(0.62f,0.014f,0.06f), new Color32(233,232,208,255));
            Part(contractBay, "Dispatch conveyor", new Vector3(-0.8f,0.28f,-1.03f), new Vector3(2.25f,0.13f,0.52f), new Color32(115,139,137,255));
            for (int roller = 0; roller < 9; roller++)
            {
                var axle = Part(contractBay, "Conveyor roller", new Vector3(-1.7f + roller * 0.23f,0.36f,-1.03f), new Vector3(0.065f,0.26f,0.065f), new Color32(183,199,193,255), PrimitiveType.Cylinder);
                axle.localRotation = Quaternion.Euler(90,0,0);
            }
            Part(contractBay, "Dispatch pallet", new Vector3(0.24f,0.22f,-1.12f), new Vector3(1.06f,0.12f,0.78f), new Color32(135,157,149,255));
            contractDockStock = new GameObject("Contract dispatch stock").transform;
            contractDockStock.SetParent(contractBay, false);
            contractDockStock.localPosition = new Vector3(0,0.41f,-1.12f);
            for (int crate = 0; crate < 6; crate++)
                BuildCrate(contractDockStock, new Vector3(crate % 2 * 0.41f,crate / 2 * 0.3f,0), new Vector3(0.36f,0.27f,0.55f), new Color32(192,174,112,255));

            contractTruck = new GameObject("Company freight truck").transform;
            contractTruck.SetParent(stage, false);
            contractTruck.localPosition = new Vector3(TruckRoadX,0,-2.25f);
            Part(contractTruck, "Truck chassis", new Vector3(0,0.43f,0), new Vector3(2.5f,0.16f,0.93f), new Color32(68,88,85,255));
            Part(contractTruck, "Freight bed", new Vector3(-0.4f,0.56f,0), new Vector3(1.68f,0.11f,1.12f), new Color32(158,180,173,255));
            TruckPaint("Cab body", new Vector3(0.86f,0.73f,0), new Vector3(0.78f,0.62f,1.08f));
            TruckPaint("Cab roof", new Vector3(0.85f,1.09f,0), new Vector3(0.86f,0.085f,1.15f));
            TruckPaint("Bed side", new Vector3(-0.4f,0.69f,-0.55f), new Vector3(1.72f,0.19f,0.07f));
            TruckPaint("Bed side", new Vector3(-0.4f,0.78f,0.55f), new Vector3(1.72f,0.37f,0.07f));
            TruckPaint("Tailgate", new Vector3(-1.25f,0.79f,0), new Vector3(0.065f,0.38f,1.12f));
            Part(contractTruck, "Cab side window", new Vector3(0.86f,0.91f,-0.558f), new Vector3(0.51f,0.3f,0.028f), new Color32(116,181,191,255));
            Part(contractTruck, "Cab windshield", new Vector3(1.26f,0.92f,0), new Vector3(0.03f,0.28f,0.88f), new Color32(116,181,191,255));
            Part(contractTruck, "Window pillar", new Vector3(0.72f,0.91f,-0.578f), new Vector3(0.027f,0.3f,0.025f), new Color32(70,93,91,255));
            Part(contractTruck, "Door handle", new Vector3(0.72f,0.69f,-0.573f), new Vector3(0.16f,0.026f,0.04f), new Color32(222,231,224,255));
            Part(contractTruck, "Door seam", new Vector3(0.5f,0.72f,-0.555f), new Vector3(0.016f,0.51f,0.018f), new Color32(108,100,84,255));
            Part(contractTruck, "Side step", new Vector3(0.8f,0.39f,-0.64f), new Vector3(0.65f,0.07f,0.19f), new Color32(156,177,171,255));
            Part(contractTruck, "Front bumper", new Vector3(1.3f,0.47f,0), new Vector3(0.14f,0.13f,1.18f), new Color32(192,208,202,255));
            Part(contractTruck, "Rear bumper", new Vector3(-1.3f,0.43f,0), new Vector3(0.12f,0.11f,1.14f), new Color32(192,208,202,255));
            Part(contractTruck, "Front grille", new Vector3(1.276f,0.67f,0), new Vector3(0.03f,0.14f,0.53f), new Color32(57,78,75,255));
            for (int side = -1; side <= 1; side += 2)
            {
                TechPart(contractTruck, "Truck headlamp", new Vector3(1.285f,0.72f,side * 0.4f), new Vector3(0.035f,0.12f,0.18f), new Color32(247,239,204,255));
                TechPart(contractTruck, "Truck tail lamp", new Vector3(-1.29f,0.68f,side * 0.43f), new Vector3(0.035f,0.09f,0.13f), new Color32(225,94,74,255));
                Part(contractTruck, "Truck mirror", new Vector3(1.12f,0.9f,side * 0.67f), new Vector3(0.12f,0.16f,0.06f), new Color32(84,108,103,255));
                for (int axle = -1; axle <= 1; axle += 2)
                {
                    var wheel = Part(contractTruck, "Truck tire", new Vector3(axle * 0.87f,0.35f,side * 0.54f), new Vector3(0.225f,0.09f,0.225f), new Color32(36,48,46,255), PrimitiveType.Cylinder);
                    wheel.localRotation = Quaternion.Euler(90,0,0);
                    truckWheels.Add(wheel);
                    Part(wheel, "Wheel hub", new Vector3(0,side * 0.105f,0), new Vector3(0.12f,0.014f,0.12f), new Color32(186,204,197,255), PrimitiveType.Cylinder);
                    Part(wheel, "Wheel lug", new Vector3(0,side * 0.125f,0), new Vector3(0.04f,0.02f,0.16f), new Color32(93,119,110,255));
                }
            }
            truckBeacon = TechPart(contractTruck, "Truck hazard beacon", new Vector3(0.85f,1.19f,0), new Vector3(0.16f,0.13f,0.16f), new Color32(245,188,69,255));
            Part(contractTruck, "Company nameplate", new Vector3(-0.37f,0.7f,-0.593f), new Vector3(1.27f,0.15f,0.022f), new Color32(240,244,230,255));
            var sign = new GameObject("Contract carrier name");
            sign.transform.SetParent(contractTruck, false);
            sign.transform.localPosition = new Vector3(-0.37f,0.7f,-0.615f);
            truckCompanyMark = sign.AddComponent<TextMesh>();
            truckCompanyMark.font = Resources.Load<Font>("Tycoon/Rajdhani");
            truckCompanyMark.fontSize = 48;
            truckCompanyMark.characterSize = 0.04f;
            truckCompanyMark.anchor = TextAnchor.MiddleCenter;
            truckCompanyMark.alignment = TextAlignment.Center;
            truckCompanyMark.color = new Color32(39,61,56,255);
            sign.GetComponent<Renderer>().sharedMaterial = truckCompanyMark.font.material;
            contractTruckCargo = new GameObject("Truck cargo").transform;
            contractTruckCargo.SetParent(contractTruck, false);
            for (int crate = 0; crate < 6; crate++)
                BuildCrate(contractTruckCargo, new Vector3(-0.92f + crate % 3 * 0.47f,0.78f + crate / 3 * 0.32f,0), new Vector3(0.42f,0.29f,0.76f), new Color32(192,174,112,255));
            contractTransfer = BuildCrate(stage, Vector3.zero, new Vector3(0.35f,0.27f,0.55f), new Color32(192,174,112,255));
            contractTransfer.name = "Contract cargo transfer";
            contractTruck.gameObject.SetActive(false);
            contractTransfer.gameObject.SetActive(false);
            contractDockStock.gameObject.SetActive(false);
        }

        private void TruckPaint(string title, Vector3 position, Vector3 size)
        {
            truckLivery.Add(Part(contractTruck, title, position, size, CompanyColors[0]).GetComponent<Renderer>());
        }

        private bool IsContractDynamicPart(Transform item) => item.IsChildOf(contractTruck)
            || item.IsChildOf(contractDockStock) || item.IsChildOf(contractTransfer) || item == truckBeacon;

        private void UpdateContractLogistics(MathscriptEconomy state)
        {
            var logistics = state.contracts;
            bool surface = state.viewport == 0;
            bool loading = logistics.truckState == "LOADING";
            bool travelling = logistics.truckState == "ARRIVING" || logistics.truckState == "DEPARTING";
            contractBay.gameObject.SetActive(surface);
            contractTruck.gameObject.SetActive(surface && logistics.truckState != "IDLE");
            contractTransfer.gameObject.SetActive(surface && loading);
            if (state.HasCompanyContract && truckCompany != logistics.company)
            {
                truckCompany = logistics.company;
                var paint = new MaterialPropertyBlock();
                paint.SetColor("_Color", CompanyColors[truckCompany]);
                foreach (var renderer in truckLivery) renderer.SetPropertyBlock(paint);
                truckCompanyMark.text = MathscriptEconomy.CompanyNames[truckCompany].ToUpperInvariant();
            }
            float progress = (float)state.TruckProgress;
            float previousX = contractTruck.localPosition.x;
            float horizontal = logistics.truckState == "ARRIVING" ? Mathf.Lerp(TruckRoadX,TruckDockX,Mathf.SmoothStep(0,1,progress))
                : logistics.truckState == "DEPARTING" ? Mathf.Lerp(TruckDockX,TruckRoadX,Mathf.SmoothStep(0,1,progress)) : TruckDockX;
            contractTruck.localPosition = new Vector3(horizontal,0,-2.25f);
            if (travelling)
                foreach (Transform wheel in truckWheels) wheel.Rotate(Vector3.up,(horizontal - previousX) * 250,Space.Self);
            truckBeacon.gameObject.SetActive(logistics.truckState == "ARRIVING" || loading);
            int payloadCrates = Mathf.Clamp(Mathf.CeilToInt((float)(logistics.payloadRC / 3)),0,6);
            int loadedCrates = loading ? Mathf.Min(payloadCrates,Mathf.FloorToInt(progress * (payloadCrates + 1))) : payloadCrates;
            for (int crate = 0; crate < contractTruckCargo.childCount; crate++)
                contractTruckCargo.GetChild(crate).gameObject.SetActive(crate < loadedCrates);
            int stagedCrates = Mathf.Clamp(Mathf.CeilToInt((float)(logistics.stagedRC / 3)) + (loading ? payloadCrates - loadedCrates : 0),0,6);
            contractDockStock.gameObject.SetActive(surface && stagedCrates > 0);
            for (int crate = 0; crate < contractDockStock.childCount; crate++)
                contractDockStock.GetChild(crate).gameObject.SetActive(crate < stagedCrates);
            if (loading)
            {
                float transferProgress = Mathf.Repeat(progress * Mathf.Max(1,payloadCrates),1);
                Vector3 from = contractDockStock.position + new Vector3(0,0.16f,0);
                Vector3 to = contractTruck.TransformPoint(new Vector3(-0.45f,0.84f,0));
                contractTransfer.position = Vector3.Lerp(from,to,transferProgress) + Vector3.up * Mathf.Sin(transferProgress * Mathf.PI) * 0.24f;
            }
        }

        internal ContractVisualSnapshot ContractVisualState()
        {
            var snapshot = new ContractVisualSnapshot
            {
                truckVisible = contractTruck.gameObject.activeInHierarchy,
                transferVisible = contractTransfer.gameObject.activeInHierarchy,
                company = truckCompany < 0 ? "" : MathscriptEconomy.CompanyNames[truckCompany],
                truckPosition = contractTruck.position,
                dockCrates = ActiveCrates(contractDockStock),
                loadedCrates = ActiveCrates(contractTruckCargo)
            };
            if (!snapshot.truckVisible) return snapshot;
            var bounds = new Bounds(contractTruck.position,Vector3.zero);
            foreach (var renderer in contractTruck.GetComponentsInChildren<MeshRenderer>())
                if (renderer.enabled) bounds.Encapsulate(renderer.bounds);
            Vector2 lower = new Vector2(float.MaxValue,float.MaxValue);
            Vector2 upper = new Vector2(float.MinValue,float.MinValue);
            for (int corner = 0; corner < 8; corner++)
            {
                Vector3 point = bounds.center + Vector3.Scale(bounds.extents,new Vector3((corner & 1) == 0 ? -1 : 1,(corner & 2) == 0 ? -1 : 1,(corner & 4) == 0 ? -1 : 1));
                Vector2 screen = sceneCamera.WorldToScreenPoint(point);
                lower = Vector2.Min(lower,screen);
                upper = Vector2.Max(upper,screen);
            }
            snapshot.truckBounds = new Rect(lower.x,Screen.height - upper.y,upper.x - lower.x,upper.y - lower.y);
            return snapshot;
        }

        private static int ActiveCrates(Transform stock)
        {
            int count = 0;
            foreach (Transform crate in stock) if (crate.gameObject.activeInHierarchy) count++;
            return count;
        }
    }
}