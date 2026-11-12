using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptTycoonUI
    {
        private Label contractCompany;
        private Label contractTrip;
        private Label contractCargo;
        private VisualElement contractProgress;
        private int observedShipments;

        private void CreateContractDock(VisualElement actions)
        {
            var area = Element(actions,"dock-action");
            area.AddToClassList("contract-action");
            var open = Command(area,"CONTRACTS",OpenContracts,"contract-command");
            open.name = "company-contracts";
            open.tooltip = "Company contracts and freight pickups";
            contractCompany = Readout(Text(area,"","dock-detail"),"contract-company");
            contractTrip = Readout(Text(area,"","dock-detail"),"contract-trip");
            contractCargo = Readout(Text(area,"","cargo-detail"),"contract-cargo");
            contractProgress = Element(Element(area,"pipeline-track"),"pipeline-fill");
        }

        private void RefreshContractDock()
        {
            var logistics = State.contracts;
            contractCompany.text = State.HasCompanyContract ? MathscriptEconomy.CompanyNames[logistics.company] : "NO CONTRACT";
            contractCompany.tooltip = State.HasCompanyContract
                ? MathscriptEconomy.CompanyNames[logistics.company] + " / " + Number(logistics.remainingRC) + " RC outstanding"
                : "No active company order";
            contractTrip.text = logistics.truckState == "IDLE" ? State.HasCompanyContract ? "AWAITING RC" : "READY"
                : logistics.truckState + " " + Math.Ceiling(logistics.truckRemaining) + "s";
            contractTrip.tooltip = "Freight pickup: " + contractTrip.text;
            contractCargo.text = Number(logistics.stagedRC) + " DOCK / " + Number(logistics.payloadRC) + " LOAD";
            contractCargo.tooltip = MathscriptNumber.Exact(logistics.stagedRC) + " RC ready at the processing center / "
                + MathscriptNumber.Exact(logistics.payloadRC) + " RC reserved in the vehicle";
            contractProgress.style.width = Length.Percent((float)(State.ContractProgress * 100));
            if (logistics.shipments > observedShipments)
                game.SetStatus("Freight delivered " + Number(logistics.lastDeliveryRC) + " RC / +$" + Number(logistics.lastDeliveryPay));
            observedShipments = logistics.shipments;
        }

        private void OpenContracts()
        {
            OpenDialog("COMPANY CONTRACTS");
            var active = Text(dialog,"","contract-active");
            var fill = Element(Element(dialog,"pipeline-track"),"pipeline-fill");
            var ledger = Element(dialog,"company-ledger");
            var outstanding = Ledger(ledger,"Order remaining");
            var ready = Ledger(ledger,"Dock / vehicle cargo");
            var pickup = Ledger(ledger,"Freight pickup");
            var shipped = Ledger(ledger,"Delivered / shipments");
            var earnings = Ledger(ledger,"Contract earnings");
            dialogRefreshers.Add(() =>
            {
                var logistics = State.contracts;
                active.text = State.HasCompanyContract ? MathscriptEconomy.CompanyNames[logistics.company] + " / ACTIVE ORDER" : "NO ACTIVE ORDER";
                outstanding.text = State.HasCompanyContract ? Number(logistics.remainingRC) + " / " + Number(MathscriptEconomy.CompanyQuotas[logistics.company]) + " RC" : "0 RC";
                ready.text = Number(logistics.stagedRC) + " / " + Number(logistics.payloadRC) + " RC";
                pickup.text = logistics.truckState == "IDLE" ? State.HasCompanyContract ? "Awaiting cargo" : "Ready" : Phase(logistics.truckState) + " / " + Math.Ceiling(logistics.truckRemaining) + "s";
                shipped.text = Number(logistics.deliveredRC) + " RC / " + logistics.shipments;
                earnings.text = MathscriptNumber.Money(logistics.earnings);
                fill.style.width = Length.Percent((float)(State.ContractProgress * 100));
            });
            Color[] accents = { new Color32(228,109,82,255), new Color32(77,150,206,255), new Color32(216,181,70,255) };
            for (int company = 0; company < MathscriptEconomy.CompanyNames.Length; company++)
            {
                int selected = company;
                var offer = Element(dialog,"contract-offer");
                var heading = Element(offer,"contract-heading");
                var swatch = Element(heading,"company-swatch");
                swatch.style.backgroundColor = accents[company];
                Text(heading,MathscriptEconomy.CompanyNames[company],"contract-name");
                Text(offer,MathscriptEconomy.CompanyServices[company],"muted");
                Text(offer,Number(MathscriptEconomy.CompanyQuotas[company]) + " RC / +" + Number((MathscriptEconomy.CompanyPremiums[company] - 1) * 100)
                    + "% / +$" + Number(MathscriptEconomy.CompanyBonuses[company]) + " completion","contract-terms");
                var history = Text(offer,"","muted");
                var sign = Command(offer,"",() =>
                {
                    if (!State.AcceptCompanyContract(selected)) return;
                    game.SetStatus(MathscriptEconomy.CompanyNames[selected] + " contract signed");
                    CloseDialog();
                },"invest");
                sign.name = "sign-contract-" + company;
                sign.tooltip = "Sign " + MathscriptEconomy.CompanyNames[company] + " / " + Number(MathscriptEconomy.CompanyQuotas[company]) + " RC order";
                dialogRefreshers.Add(() =>
                {
                    bool available = State.CompanyContractAvailable(selected);
                    sign.text = State.HasCompanyContract ? State.contracts.company == selected ? "ACTIVE / " + MathscriptEconomy.CompanyNames[selected].ToUpperInvariant() : "FULFILL CURRENT ORDER"
                        : available ? "SIGN " + MathscriptEconomy.CompanyNames[selected].ToUpperInvariant() : "LOCKED / " + Number(MathscriptEconomy.CompanyUnlockRC[selected]) + " RC PROCESSED";
                    sign.SetEnabled(!State.HasCompanyContract && available);
                    history.text = Number(MathscriptEconomy.CompanyTruckCapacity[selected]) + " RC / truck  |  " + State.contracts.completed[selected] + " completed";
                });
            }
            Command(dialog,"CLOSE",CloseDialog);
            FocusDialog();
        }

        internal IEnumerator CheckContractInteractions()
        {
            game.ReplaceState(new MathscriptEconomy { compilerBuffer = 12 });
            shownViewport = -1;
            Refresh();
            yield return null;
            Press("CONTRACTS");
            yield return null;
            Press("SIGN VECTOR LABS");
            if (!State.HasCompanyContract || State.contracts.company != 0 || State.coins != 1000)
                throw new InvalidOperationException("Contract signing UI did not create one free company order");
            State.tracks[3] = 3;
            Press("COMPILE");
            float deadline = Time.time + 20;
            while (State.contracts.truckState != "LOADING" && Time.time < deadline) yield return null;
            if (State.contracts.truckState != "LOADING") throw new InvalidOperationException("Company truck did not reach the processing center");
            yield return new WaitForSeconds(0.8f);
            yield return new WaitForEndOfFrame();
            var loading = game.Perspective.ContractVisualState();
            if (!loading.truckVisible || !loading.transferVisible || loading.loadedCrates <= 0 || State.coins != 1000)
                throw new InvalidOperationException("Company vehicle failed to load real cargo before payment");
            AssertLayout();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath,"mathscript-contract-native-loading.png"));
            while (State.contracts.truckState != "DEPARTING" && Time.time < deadline) yield return null;
            Vector3 before = game.Perspective.ContractVisualState().truckPosition;
            yield return new WaitForSeconds(0.7f);
            if (Vector3.Distance(before,game.Perspective.ContractVisualState().truckPosition) < 0.3f)
                throw new InvalidOperationException("Loaded company vehicle did not drive away");
            deadline = Time.time + 20;
            while (State.contracts.completed[0] == 0 && Time.time < deadline) yield return null;
            if (State.contracts.completed[0] != 1 || State.HasCompanyContract || State.contracts.deliveredRC != 12
                || State.contracts.shipments != 2 || State.coins <= 1000 || !MathscriptSave.Valid(State))
                throw new InvalidOperationException("Native contract did not consume twelve RC and complete two deliveries once");
            double paid = State.coins;
            yield return new WaitForSeconds(0.5f);
            if (State.coins != paid) throw new InvalidOperationException("Completed native freight replayed its payout");
            Debug.Log("MATHSCRIPT_CONTRACT_RUNTIME_PASS signing/loading/visible-cargo/driving/delivery/no-replay");
        }
    }
}