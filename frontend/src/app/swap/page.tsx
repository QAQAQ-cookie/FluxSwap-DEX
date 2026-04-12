'use client';

import { useTranslation } from 'react-i18next';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useState, useEffect } from 'react';
import { Settings, ArrowDown, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function SwapPage() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [mounted, setMounted] = useState(false);

  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [payToken, setPayToken] = useState('ETH');
  const [receiveToken, setReceiveToken] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [deadline, setDeadline] = useState('20');

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePayAmountChange = (val: string) => {
    setPayAmount(val);
    // 模拟计算接收数量
    if (val && parseFloat(val) > 0) {
      setReceiveAmount((parseFloat(val) * 0.98).toFixed(4));
    } else {
      setReceiveAmount('');
    }
  };

  const handleFlip = () => {
    const tempToken = payToken;
    setPayToken(receiveToken || 'USDT');
    setReceiveToken(tempToken);

    const tempAmount = payAmount;
    setPayAmount(receiveAmount);
    // 模拟反向计算
    if (receiveAmount && parseFloat(receiveAmount) > 0) {
      setReceiveAmount((parseFloat(receiveAmount) * 0.98).toFixed(4));
    } else {
      setReceiveAmount('');
    }
  };

  const handleMaxPay = () => {
    handlePayAmountChange('1.5'); // 模拟最大余额
  };

  const isDetailsOpen = mounted && parseFloat(payAmount) > 0;

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 bg-gray-50 dark:bg-gray-900 min-h-[calc(100vh-80px)] transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-4 shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between px-2 mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('swap.title')}</h2>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
        
        {/* Pay Section */}
        <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl p-4 border border-transparent hover:border-gray-300 dark:hover:border-gray-700 transition-colors relative">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('swap.pay')}</div>
          <div className="flex justify-between items-center mb-2">
            <input 
              type="number" 
              placeholder="0.0" 
              min="0"
              value={payAmount}
              onChange={(e) => handlePayAmountChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === '-' || e.key === 'e') e.preventDefault();
              }}
              className="bg-transparent text-3xl font-bold outline-none w-full text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap">
              {payToken} <ChevronDown size={14} />
            </button>
          </div>
          {mounted && isConnected && (
            <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-2">
                {t('swap.balance')}: 1.50
                <button onClick={handleMaxPay} className="text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700 dark:hover:text-blue-300">
                  {t('swap.max')}
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Flip Button */}
        <div className="relative h-2 flex justify-center items-center z-10 -my-2">
          <button 
            onClick={handleFlip}
            className="bg-gray-100 dark:bg-gray-900 border-4 border-white dark:border-gray-800 p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowDown size={16} />
          </button>
        </div>
        
        {/* Receive Section */}
        <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl p-4 mb-4 border border-transparent hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('swap.receive')}</div>
          <div className="flex justify-between items-center mb-2">
            <input 
              type="number" 
              placeholder="0.0" 
              min="0"
              value={receiveAmount}
              readOnly
              className="bg-transparent text-3xl font-bold outline-none w-full text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {receiveToken ? (
              <button className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap">
                {receiveToken} <ChevronDown size={14} />
              </button>
            ) : (
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap">
                {t('swap.selectToken')} <ChevronDown size={14} />
              </button>
            )}
          </div>
          {mounted && isConnected && receiveToken && (
            <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
              <span>{t('swap.balance')}: 0.00</span>
            </div>
          )}
        </div>

        {/* Trade Details Accordion */}
        {isDetailsOpen && (
          <div className="mb-4 px-4 py-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 text-sm space-y-2">
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t('swap.rate')}</span>
              <span className="font-medium">1 {payToken} = 0.98 {receiveToken || 'TOKEN'}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t('swap.priceImpact')}</span>
              <span className="font-medium text-emerald-500">~0.10%</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t('swap.fee')}</span>
              <span className="font-medium">$2.50</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t('swap.route')}</span>
              <span className="font-medium">{payToken} {'>'} {receiveToken || 'TOKEN'}</span>
            </div>
          </div>
        )}
        
        {/* Action Button */}
        {!mounted || !isConnected ? (
          <button 
            onClick={openConnectModal}
            className="w-full bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-bold py-4 rounded-2xl hover:bg-blue-200 dark:hover:bg-blue-600/30 transition-colors border border-blue-200 dark:border-blue-900/50"
          >
            {t('swap.connectWallet')}
          </button>
        ) : (
          <button 
            className={`w-full font-bold py-4 rounded-2xl transition-colors shadow-lg ${
              !payAmount || parseFloat(payAmount) === 0 
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed shadow-none' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30'
            }`}
            disabled={!payAmount || parseFloat(payAmount) === 0}
          >
            {t('swap.button')}
          </button>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('swap.settings')}</h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('swap.slippage')}
                </label>
                <div className="flex gap-2">
                  {['0.1', '0.5', '1.0'].map(val => (
                    <button
                      key={val}
                      onClick={() => setSlippage(val)}
                      className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                        slippage === val 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-transparent hover:border-gray-300 dark:hover:border-gray-600 border'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                  <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-900 rounded-xl px-3 border border-transparent focus-within:border-blue-500 transition-colors">
                    <input 
                      type="number"
                      value={slippage}
                      onChange={(e) => setSlippage(e.target.value)}
                      className="w-full bg-transparent outline-none text-gray-900 dark:text-white text-right"
                      placeholder="0.5"
                    />
                    <span className="ml-1 text-gray-500">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('swap.deadline')}
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-24 bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-2 outline-none text-gray-900 dark:text-white border border-transparent focus:border-blue-500 transition-colors"
                  />
                  <span className="text-gray-500 dark:text-gray-400">{t('swap.minutes')}</span>
                </div>
              </div>

              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors mt-4"
              >
                {t('swap.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
