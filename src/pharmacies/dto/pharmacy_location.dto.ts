export class pharmacyLocationDto {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    phone : string;
    region: string;
    status: 'OPEN' | 'CLOSED';
    isActive: boolean;
    distance?: number;
    hours: string;
    rating: number;
    
}