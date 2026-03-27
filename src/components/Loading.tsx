import CenterScreen from './CenterScreen'

export default function Loading({ text }: { text?: string }) {
  return (
    <CenterScreen>
      <div style={{ position: 'relative', width: '400px', height: '400px' }}>
        <img
          src="/images/background_logo.svg"
          alt="Logo"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: 0.4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40px',
            height: '40px',
          }}
        >
          <div className="spinner-ring" />
          <div className="spinner-ring-secondary" />
          <div className="spinner-glow" />
        </div>
      </div>
      <style>
        {`
          .spinner-ring {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid transparent;
            border-top-color: rgba(255, 255, 255, 0.9);
            border-right-color: rgba(255, 255, 255, 0.9);
            animation: spin 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
          }
          
          .spinner-ring-secondary {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid transparent;
            border-bottom-color: rgba(255, 255, 255, 0.6);
            border-left-color: rgba(255, 255, 255, 0.6);
            animation: spin-reverse 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
            box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
          }
          
          .spinner-glow {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
            animation: pulse 2s ease-in-out infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes spin-reverse {
            0% { transform: rotate(360deg); }
            100% { transform: rotate(0deg); }
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
        `}
      </style>
    </CenterScreen>
  )
}
