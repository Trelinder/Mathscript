using System;
using System.IO;
using UnityEngine;

namespace MathscriptPrototype
{
    [Serializable]
    public sealed class MathscriptOfflineProgress
    {
        public double seconds;
        public double earnings;
        public double producedRC;
        public double compiledRC;
        public bool capped;
    }

    public static class MathscriptSave
    {
        public static bool Valid(MathscriptEconomy state)
        {
            if (state == null || state.version != 3 || state.levels == null || state.levels.Length != 7
                || state.bins == null || state.bins.Length != 7 || state.hired == null || state.hired.Length != 7
                || state.tracks == null || state.tracks.Length != 6 || state.challengesDone == null || state.challengesDone.Length != 3
                || state.challengesPending == null || state.challengesPending.Length != 3 || state.route == null
                || state.viewport < 0 || state.viewport > 6 || state.routeViewport < 0 || state.routeViewport > 5
                || state.routeIndex < 0 || state.routeIndex > state.route.Length || state.savedAt < 0) return false;
            if (state.research == null || state.research.Length != 3 || state.questsDone == null || state.questsDone.Length != 3
                || state.skillUntil == null || state.skillUntil.Length != 9 || state.cooldownUntil == null || state.cooldownUntil.Length != 9
                || state.claimedTokens < 0 || state.claimedTokens > state.PotentialTokens || state.refactors < 0 || !Finite(state.clockMs)) return false;
            for (int node = 1; node < 3; node++) if (state.research[node] && !state.research[node - 1]) return false;
            for (int manager = 0; manager < 9; manager++)
                if (!Finite(state.skillUntil[manager]) || !Finite(state.cooldownUntil[manager]) || state.skillUntil[manager] > state.cooldownUntil[manager]) return false;
            bool locked = false;
            for (int floor = 0; floor < 7; floor++)
            {
                if (state.levels[floor] < 0 || state.levels[floor] > 10000 || !Finite(state.bins[floor])) return false;
                if (state.levels[floor] == 0) { locked = true; if (state.hired[floor] || state.bins[floor] != 0) return false; }
                else if (locked) return false;
            }
            foreach (int track in state.tracks) if (track < 0 || track > 10000) return false;
            if (state.tracks[1] > 40 || state.tracks[2] > 12 || state.tracks[4] > 10) return false;
            foreach (int floor in state.route) if (floor < 0 || floor > 6 || state.levels[floor] == 0) return false;
            foreach (double value in new[] { state.coins, state.lifetime, state.busPayload, state.compilerBuffer, state.processingBatch,
                state.compiledRC, state.productionClock, state.busRemaining, state.compilerRemaining, state.autoBusClock,
                state.autoCompilerClock, state.tripCapacity, state.tripMove, state.tripLoad, state.moveDuration, state.cycleProcessing })
                if (!Finite(value)) return false;
            if (state.productionClock >= 0.1 + 0.000001 || state.currentSlot < -1 || state.currentSlot > 6
                || state.targetSlot < -1 || state.targetSlot > 6 || state.fromSlot < -1 || state.fromSlot > 6) return false;
            if (Array.IndexOf(new[] { "IDLE", "MOVING_UP", "LOADING", "MOVING_DOWN", "UNLOADING" }, state.busState) < 0
                || Array.IndexOf(new[] { "IDLE", "FETCHING", "PROCESSING" }, state.compilerState) < 0) return false;
            if (state.busState == "IDLE" && state.busPayload != 0) return false;
            if ((state.busState == "LOADING" || state.busState == "MOVING_UP") && state.routeIndex >= state.route.Length) return false;
            if (state.busPayload > state.tripCapacity || (state.busState != "IDLE" && state.busRemaining <= 0)) return false;
            if (state.compilerState == "PROCESSING" && state.processingBatch <= 0) return false;
            if (state.compilerState != "PROCESSING" && state.processingBatch != 0) return false;
            if (state.compilerState != "IDLE" && state.compilerRemaining <= 0) return false;
            for (int challenge = 0; challenge < 3; challenge++)
                if (state.challengesPending[challenge] && state.challengesDone[challenge]) return false;
            return ValidContracts(state.contracts);
        }

        private static bool ValidContracts(MathscriptContractLogistics contracts)
        {
            if (contracts == null || contracts.company < -1 || contracts.company >= MathscriptEconomy.CompanyNames.Length
                || contracts.completed == null || contracts.completed.Length != 3 || contracts.shipments < 0
                || Array.IndexOf(new[] { "IDLE", "ARRIVING", "LOADING", "DEPARTING" }, contracts.truckState) < 0) return false;
            foreach (int completed in contracts.completed) if (completed < 0) return false;
            foreach (double value in new[] { contracts.remainingRC, contracts.stagedRC, contracts.stagedValue,
                contracts.payloadRC, contracts.payloadValue, contracts.truckRemaining, contracts.deliveredRC,
                contracts.earnings, contracts.lastDeliveryRC, contracts.lastDeliveryPay })
                if (!Finite(value)) return false;
            if (contracts.company < 0)
                return contracts.truckState == "IDLE" && contracts.remainingRC == 0 && contracts.stagedRC == 0
                    && contracts.stagedValue == 0 && contracts.payloadRC == 0 && contracts.payloadValue == 0 && contracts.truckRemaining == 0;
            if (contracts.remainingRC <= 0 || contracts.remainingRC > MathscriptEconomy.CompanyQuotas[contracts.company]
                || contracts.stagedRC + contracts.payloadRC > contracts.remainingRC + 0.000001
                || contracts.payloadRC > MathscriptEconomy.CompanyTruckCapacity[contracts.company]) return false;
            if (contracts.truckState == "IDLE" && contracts.truckRemaining != 0) return false;
            if (contracts.truckState != "IDLE" && contracts.truckRemaining <= 0) return false;
            bool loaded = contracts.truckState == "LOADING" || contracts.truckState == "DEPARTING";
            if (loaded ? contracts.payloadRC <= 0 : contracts.payloadRC != 0 || contracts.payloadValue != 0) return false;
            if (contracts.truckState == "ARRIVING" && contracts.stagedRC <= 0) return false;
            return contracts.stagedRC != 0 || contracts.stagedValue == 0;
        }

        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value) && value >= 0;

        public static void Write(string path, MathscriptEconomy state, long now)
        {
            state.savedAt = now;
            if (!Valid(state)) throw new InvalidDataException("Invalid idle miner state");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path + ".tmp", JsonUtility.ToJson(state));
            if (File.Exists(path)) File.Replace(path + ".tmp", path, null);
            else File.Move(path + ".tmp", path);
        }

        public static MathscriptEconomy Read(string path, long now, out double offline) => Read(path, now, out offline, out _);

        public static MathscriptEconomy Read(string path, long now, out double offline, out MathscriptOfflineProgress progress)
        {
            offline = 0;
            progress = new MathscriptOfflineProgress();
            if (!File.Exists(path)) return MathscriptEconomy.CreateCompany();
            var state = JsonUtility.FromJson<MathscriptEconomy>(File.ReadAllText(path));
            if (state != null && state.version == 1)
            {
                state.research = new bool[3];
                state.questsDone = new bool[3];
                state.skillUntil = new double[9];
                state.cooldownUntil = new double[9];
                state.version = 2;
            }
            if (state != null && state.version == 2)
            {
                if (state.currentSlot >= 0) state.currentSlot += state.routeViewport;
                if (state.targetSlot >= 0) state.targetSlot += state.routeViewport;
                if (state.fromSlot >= 0) state.fromSlot += state.routeViewport;
                state.routeViewport = 0;
                state.version = 3;
            }
            if (state != null && state.contracts == null) state.contracts = new MathscriptContractLogistics();
            if (!Valid(state)) throw new InvalidDataException("Invalid idle miner save");
            double elapsed = state.savedAt == 0 ? 0 : Math.Max(0, (now - state.savedAt) / 1000.0);
            double stock = state.FloorBin + state.busPayload + state.compilerBuffer + state.processingBatch + state.compiledRC;
            double compiled = state.compiledRC;
            offline = state.ClaimOffline(now);
            progress.seconds = elapsed >= 60 ? Math.Min(28800, elapsed) : 0;
            progress.earnings = offline;
            progress.producedRC = MathscriptEconomy.Round(state.FloorBin + state.busPayload + state.compilerBuffer + state.processingBatch + state.compiledRC - stock);
            progress.compiledRC = MathscriptEconomy.Round(state.compiledRC - compiled);
            progress.capped = elapsed > 28800;
            Write(path, state, now);
            return state;
        }
    }
}