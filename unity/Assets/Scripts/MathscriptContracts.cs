using System;

namespace MathscriptPrototype
{
    [Serializable]
    public sealed class MathscriptContractLogistics
    {
        public int company = -1;
        public double remainingRC;
        public double stagedRC;
        public double stagedValue;
        public double payloadRC;
        public double payloadValue;
        public string truckState = "IDLE";
        public double truckRemaining;
        public int[] completed = new int[3];
        public double deliveredRC;
        public double earnings;
        public int shipments;
        public double lastDeliveryRC;
        public double lastDeliveryPay;
    }

    public sealed partial class MathscriptEconomy
    {
        public MathscriptContractLogistics contracts = new MathscriptContractLogistics();
        public static readonly string[] CompanyNames = { "Vector Labs", "Helix Cloud", "Atlas Research" };
        public static readonly string[] CompanyServices = { "Compute packets", "Cloud processing", "Research datasets" };
        public static readonly double[] CompanyQuotas = { 12, 36, 90 };
        public static readonly double[] CompanyUnlockRC = { 0, 36, 120 };
        public static readonly double[] CompanyPremiums = { 1.2, 1.35, 1.5 };
        public static readonly double[] CompanyBonuses = { 35, 100, 300 };
        public static readonly double[] CompanyTruckCapacity = { 6, 12, 18 };
        public const double TruckTravelSeconds = 3.2;
        public const double TruckLoadingSeconds = 1.6;
        public bool HasCompanyContract => contracts.company >= 0;
        public double ContractProgress => HasCompanyContract ? Math.Min(1, 1 - contracts.remainingRC / CompanyQuotas[contracts.company]) : 0;
        public double TruckProgress => contracts.truckState == "IDLE" ? 0 : Math.Max(0, Math.Min(1,
            1 - contracts.truckRemaining / (contracts.truckState == "LOADING" ? TruckLoadingSeconds : TruckTravelSeconds)));

        public bool CompanyContractAvailable(int company) => company >= 0 && company < CompanyNames.Length
            && (compiledRC >= CompanyUnlockRC[company] || contracts.completed[company] > 0);

        public bool AcceptCompanyContract(int company)
        {
            if (HasCompanyContract || !CompanyContractAvailable(company) || contracts.truckState != "IDLE") return false;
            contracts.company = company;
            contracts.remainingRC = CompanyQuotas[company];
            return true;
        }

        public bool RequestContractPickup()
        {
            if (!HasCompanyContract || contracts.truckState != "IDLE" || contracts.stagedRC <= 0) return false;
            contracts.truckState = "ARRIVING";
            contracts.truckRemaining = TruckTravelSeconds;
            return true;
        }

        private void ResetOperatingContracts()
        {
            contracts = new MathscriptContractLogistics
            {
                completed = contracts.completed,
                deliveredRC = contracts.deliveredRC,
                earnings = contracts.earnings,
                shipments = contracts.shipments,
                lastDeliveryRC = contracts.lastDeliveryRC,
                lastDeliveryPay = contracts.lastDeliveryPay
            };
        }

        private void SettleCompiledCargo(double amount)
        {
            double value = Round(amount * Conversion * FlowMultiplier());
            double staged = HasCompanyContract ? Round(Math.Min(amount,
                Math.Max(0, contracts.remainingRC - contracts.stagedRC - contracts.payloadRC))) : 0;
            double stagedValue = staged > 0 ? Round(value * staged / amount) : 0;
            contracts.stagedRC = Round(contracts.stagedRC + staged);
            contracts.stagedValue = Round(contracts.stagedValue + stagedValue);
            Credit(Round(value - stagedValue));
        }

        private void ContractTruckTransition()
        {
            if (contracts.truckState == "ARRIVING")
            {
                double take = Round(Math.Min(contracts.stagedRC, CompanyTruckCapacity[contracts.company]));
                double value = Round(contracts.stagedValue * take / contracts.stagedRC);
                contracts.stagedRC = Round(contracts.stagedRC - take);
                contracts.stagedValue = Round(contracts.stagedValue - value);
                contracts.payloadRC = take;
                contracts.payloadValue = value;
                contracts.truckState = "LOADING";
                contracts.truckRemaining = TruckLoadingSeconds;
            }
            else if (contracts.truckState == "LOADING")
            {
                contracts.truckState = "DEPARTING";
                contracts.truckRemaining = TruckTravelSeconds;
            }
            else if (contracts.truckState == "DEPARTING")
            {
                int company = contracts.company;
                double payout = Round(contracts.payloadValue * CompanyPremiums[company]);
                contracts.remainingRC = Round(contracts.remainingRC - contracts.payloadRC);
                contracts.deliveredRC = Round(contracts.deliveredRC + contracts.payloadRC);
                contracts.lastDeliveryRC = contracts.payloadRC;
                contracts.payloadRC = contracts.payloadValue = 0;
                contracts.shipments++;
                contracts.truckState = "IDLE";
                contracts.truckRemaining = 0;
                if (contracts.remainingRC <= 0)
                {
                    payout = Round(payout + CompanyBonuses[company]);
                    contracts.completed[company]++;
                    contracts.company = -1;
                    contracts.remainingRC = 0;
                }
                contracts.lastDeliveryPay = payout;
                contracts.earnings = Round(contracts.earnings + payout);
                Credit(payout);
            }
        }
    }
}